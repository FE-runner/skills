import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'child_process';
import * as p from '@clack/prompts';
import { marketProvider } from './providers/market.ts';
import type { ObservabilityInstallCommand } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

/**
 * 子命令/别名关键字。`obs list` / `obs refresh` / `obs install` 已有子命令语义，
 * `obs add <name>` 与 `obs <name>` 等价（add 为 create 语义的别名），
 * 因此这些关键字不能再被当作接入名（agentName）。
 * 接入为单一 loongsuite 方案：创建不再需要 `--agent`。
 */
const RESERVED_OBS_KEYWORDS = new Set(['add', 'list', 'refresh', 'install', 'uninstall']);

export type ObsSubcommand = 'create' | 'list' | 'refresh' | 'install' | 'uninstall';

export interface ObsOptions {
  subcommand?: ObsSubcommand;
  /** create：接入名（agentName） */
  agentName?: string;
  /** create：可选备注 */
  note?: string;
  /** refresh/install：agentId 原始字符串 */
  agentId?: string;
  /** uninstall：连同本地数据（~/.loongsuite-pilot）一起删除 */
  purge?: boolean;
  help: boolean;
  /** 本地参数校验/保留字冲突错误消息（非空时命令应立即失败，不发起请求） */
  error?: string;
}

/** 官方 LoongSuite Pilot 安装脚本 OSS 直链（与 Market 端 OBSERVABILITY_INSTALL_TEMPLATE 同源，改动需两边同步） */
const PILOT_INSTALLER_SH_URL =
  'https://aliyun-observability-release-cn-shanghai.oss-cn-shanghai.aliyuncs.com/loongsuite-pilot/installer.sh';
const PILOT_INSTALLER_PS1_URL =
  'https://aliyun-observability-release-cn-shanghai.oss-cn-shanghai.aliyuncs.com/loongsuite-pilot/installer.ps1';

/**
 * 解析 `skills obs …` 子命令参数。
 *
 * - `obs <agentName> [--note …]`（`add` 作为 create 别名可跳过）→ create（无 `--agent`）
 * - `obs list`　→ list（仅接受该关键字，带 `--agent`/`--note` 时视为把 list 当接入名，报保留字冲突）
 * - `obs refresh <agentId>` → refresh（agentId 必填，UUID（与 serviceName 同源），`--agent`/`--note` 不适用）
 * - 位置参数缺失、位置参数命中保留字、未知选项时返回 `error`（本地拒绝）
 */
export function parseObsOptions(args: string[]): ObsOptions {
  const positionals: string[] = [];
  let note: string | undefined;
  let purge = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--note') {
      note = args[++i];
    } else if (arg === '--purge') {
      purge = true;
    } else if (arg && arg.startsWith('-')) {
      return { help, error: `不支持的选项: ${arg}` };
    } else if (arg) {
      positionals.push(arg);
    }
  }

  if (help) return { help: true };

  const first = positionals[0];
  if (!first) {
    return { help, error: '缺少子命令或接入名。用法: obs <agentName> [--note …]' };
  }

  if (first === 'list') {
    if (positionals.length > 1 || note) {
      return {
        help,
        error: `"list" 是子命令关键字，不能作为接入名。直接运行 \`${BIN_NAME} obs list\` 查看清单`,
      };
    }
    return { help, subcommand: 'list' };
  }

  if (first === 'uninstall') {
    if (positionals.length > 1) {
      return { help, error: 'uninstall 不接受位置参数。用法: obs uninstall [--purge]' };
    }
    return { help, subcommand: 'uninstall', purge };
  }

  if (first === 'refresh' || first === 'install') {
    const subcommand = first;
    if (positionals.length < 2) {
      return { help, error: `缺少 agentId。用法: obs ${subcommand} <agentId>` };
    }
    if (positionals.length > 2 || note) {
      return { help, error: `${subcommand} 只接受一个 agentId 位置参数` };
    }
    const agentId = positionals[1];
    if (!agentId || !/^[0-9a-fA-F-]{36}$/.test(agentId)) {
      return {
        help,
        error: `agentId 必须是 UUID（36 位，与 serviceName 同源），收到 "${agentId}"`,
      };
    }
    return { help, subcommand, agentId };
  }

  if (first === 'add' && positionals.length >= 2) {
    // add 别名：跳过 add 取下一个位置参数为 agentName（length >= 2 保证存在）
    const agentName = positionals[1]!;
    if (RESERVED_OBS_KEYWORDS.has(agentName)) {
      return { help, error: `"${agentName}" 是子命令关键字，不能作为接入名（agentName）。` };
    }
    if (positionals.length > 2) {
      return { help, error: '多余的位置参数。用法: obs add <agentName> [--note ……]' };
    }
    return { help, subcommand: 'create', agentName, note };
  }

  // create 语义（第一位置参数即 agentName）
  const agentName = first;
  if (RESERVED_OBS_KEYWORDS.has(agentName)) {
    return { help, error: `"${agentName}" 是子命令关键字，不能作为接入名（agentName）。` };
  }
  if (positionals.length > 1) {
    return { help, error: '多余的位置参数。用法: obs <agentName> [--note ……]' };
  }

  return { help, subcommand: 'create', agentName, note };
}

/**
 * 展示 `skills obs --help` 用法。供 `obs --help`/`-h` 与 `skills --help` 复用文案约定。
 */
export function showObsHelp(): void {
  console.log(`
Usage: ${BIN_NAME} obs <command> [options]

Manage AI Coding Agent observability records (shared with the Market web dashboard, LoongSuite Pilot).

Commands:
  obs <agentName> [--note <note>]
                           Create an observability record and print its install commands
                           (plus a local LoongSuite Pilot check)
  obs add <agentName> [--note <note>]
                           Same as above (add is an alias)
  obs list                 List your observability records (marks ones installed on this machine)
  obs refresh <agentId>    Generate a new install token (old ones are invalidated immediately)
  obs install <agentId>    Generate a new install token AND run it on this machine
                           (double-confirms when a local install already exists)
  obs uninstall [--purge]  Uninstall LoongSuite Pilot on this machine
                           (--purge also deletes local data in ~/.loongsuite-pilot)

Options:
  --note <note>    Optional note for the record
  --help, -h       Show this help message
`);
}

/**
 * 本机 LoongSuite Pilot 安装状态（分层信号，均不执行任何插件命令）。
 *
 * - `serviceName`：config.json 的 serviceNamePrefix（BSM-<agentId>），缺失/损坏为 null
 * - `hasBinary`：程序文件痕迹（current 版本文件 / bin / versions 目录），用于排除
 *   「官方 uninstall 保留本地数据后只剩配置」的残留误报
 * - `isRunning`：pid 文件 + `process.kill(pid, 0)` 探测进程存活；null = 无 pid 文件，无法判断
 */
export interface LocalPilotStatus {
  serviceName: string | null;
  hasBinary: boolean;
  isRunning: boolean | null;
}

/** 二进制痕迹判定：任一程序文件/目录存在即认为二进制还在 */
function hasPilotBinary(pilotDir: string): boolean {
  return (
    existsSync(join(pilotDir, 'current')) ||
    existsSync(join(pilotDir, 'bin')) ||
    existsSync(join(pilotDir, 'versions')) ||
    existsSync(join(pilotDir, 'runtime'))
  );
}

/** pid 文件 + kill(pid, 0) 探测服务进程；无 pid 文件返回 null（无法判断） */
function probePilotRunning(pilotDir: string): boolean | null {
  const pidPath = join(pilotDir, 'loongsuite-pilot.pid');
  if (!existsSync(pidPath)) return null;
  try {
    const raw = readFileSync(pidPath, 'utf-8').trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0); // 信号 0 不发数据，仅探测进程存在
    return true;
  } catch (err) {
    // EPERM = 进程存在但无权限发信号，同样视为在运行
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return true;
    return false;
  }
}

/**
 * 读取本机 LoongSuite Pilot 安装状态。目录缺失时返回全空状态（静默降级，不报错）。
 */
export function readLocalPilotStatus(
  pilotDir: string = join(homedir(), '.loongsuite-pilot')
): LocalPilotStatus {
  const configPath = join(pilotDir, 'config.json');
  let serviceName: string | null = null;
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as {
        serviceNamePrefix?: unknown;
      };
      const prefix = raw.serviceNamePrefix;
      if (typeof prefix === 'string' && prefix.length > 0) serviceName = prefix;
    } catch {
      // config 损坏：保留 serviceName=null，由程序文件痕迹兜底判断
    }
  }
  return {
    serviceName,
    hasBinary: hasPilotBinary(pilotDir),
    isRunning: probePilotRunning(pilotDir),
  };
}

/**
 * 读取本机 LoongSuite Pilot 配置（`~/.loongsuite-pilot/config.json`）中的 `serviceNamePrefix`。
 * 该字段由安装脚本写入，值为 `BSM-<agentId>`，可与 Market 接入记录的 serviceName 直接比对，
 * 从而判断某条接入是否安装在本机。未安装、文件损坏或字段缺失时返回 null（静默降级，不报错）。
 */
export function readLocalPilotServiceName(
  pilotDir: string = join(homedir(), '.loongsuite-pilot')
): string | null {
  return readLocalPilotStatus(pilotDir).serviceName;
}

/**
 * 打印接入清单。每条记录必须打印 `agentId`（`obs refresh <agentId>` 所需 id 由此获取）。
 * 接入为单一 loongsuite 方案：不印 Agent 类型列。
 * `localStatus` 非空时与记录 serviceName 比对，给安装在本机的接入打「本机已安装」标记；
 * 仅配置残留（程序文件缺失）时改为在尾部提示残留，不误标已安装。
 */
function printObservabilityList(
  records: Array<{
    id: string;
    agentName: string;
    note?: string | null;
    serviceName: string;
    createdAt: string;
  }>,
  localStatus?: LocalPilotStatus
): void {
  if (records.length === 0) {
    console.log('暂无接入记录。运行 `' + BIN_NAME + ' obs <agentName>` 创建。');
    return;
  }
  const markable = localStatus?.serviceName != null && localStatus.hasBinary;
  const runningSuffix = localStatus?.isRunning === false ? '(服务未运行)' : '';
  console.log(`共 ${records.length} 条接入记录:`);
  for (const record of records) {
    const noteSuffix = record.note ? ` (备注: ${record.note})` : '';
    const localMark =
      markable && record.serviceName === localStatus?.serviceName
        ? `  ✓ 本机已安装${runningSuffix}`
        : '';
    console.log(
      `#${record.id}  ${record.agentName}  ${record.serviceName}  ${record.createdAt}${noteSuffix}${localMark}`
    );
  }
  if (markable && !records.some((r) => r.serviceName === localStatus?.serviceName)) {
    console.log(
      `注意: 本机已安装 LoongSuite Pilot (${localStatus?.serviceName})，但未匹配到清单中的任何接入记录`
    );
  } else if (localStatus?.serviceName != null && !localStatus.hasBinary) {
    console.log(
      `注意: 本机检测到配置残留 (serviceNamePrefix: ${localStatus.serviceName})，未发现程序文件，可能已卸载不完整`
    );
  } else if (localStatus?.serviceName == null && !localStatus?.hasBinary) {
    console.log('本机未检测到 LoongSuite Pilot 安装（缺少 ~/.loongsuite-pilot/config.json）');
  }
  console.log(`换发安装凭证: ${BIN_NAME} obs refresh <agentId>`);
}

/** 检测宿主平台：Windows 走 PowerShell，其余统一 unix bash */
export function detectHostPlatform(): 'unix' | 'windows' {
  return process.platform === 'win32' ? 'windows' : 'unix';
}

/** 取对应宿主平台的包壳命令（unix 用 curl|bash；windows 用 Invoke-WebRequest + powershell） */
export function pickPlatformCommand(cmd: ObservabilityInstallCommand): string {
  return detectHostPlatform() === 'windows' ? cmd.windows : cmd.unix;
}

/**
 * 在本机执行平台生成的包壳安装命令。unix 走 `/bin/sh -c`（curl … | bash 形态），
 * windows 走 `powershell.exe -ExecutionPolicy Bypass -Command`（Invoke-WebRequest …）。
 * 安装凭证为一次性、5 分钟有效：命令执行一次后即作废，不可重复使用。
 */
export function runInstallCommand(command: string): Promise<void> {
  const isWindows = detectHostPlatform() === 'windows';
  return new Promise((resolve, reject) => {
    const child = isWindows
      ? spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-Command', command], {
          stdio: 'inherit',
        })
      : spawn('/bin/sh', ['-c', command], { stdio: 'inherit' });
    child.once('error', (err) => reject(err));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`安装命令执行失败 (exit ${code ?? signal})`));
    });
  });
}

/**
 * 构造官方卸载命令（双平台）。卸载不需要安装凭证，直接用 OSS 上的官方安装脚本
 * 执行 `uninstall` 子命令；`--purge` 连同 ~/.loongsuite-pilot 本地数据一起删除。
 */
export function buildUninstallCommand(purge: boolean): ObservabilityInstallCommand {
  const subcommand = purge ? 'uninstall --purge' : 'uninstall';
  return {
    unix: `curl -fsSL ${PILOT_INSTALLER_SH_URL} -o /tmp/loongsuite-pilot-installer.sh && bash /tmp/loongsuite-pilot-installer.sh ${subcommand}`,
    windows: `Invoke-WebRequest -Uri '${PILOT_INSTALLER_PS1_URL}' -OutFile "$env:TEMP\\loongsuite-pilot-installer.ps1" -UseBasicParsing; & "$env:TEMP\\loongsuite-pilot-installer.ps1" ${purge ? 'uninstall -Purge' : 'uninstall'}`,
  };
}

/**
 * `skills obs …` 命令：创建接入记录 / 列出接入清单 / 按 agentId 换发安装 token / 本机执行安装 / 本机卸载。
 * 复用既有 API Key 鉴权（`auth.ts`）与统一失败处理（`api-error.ts`）。
 */
export async function runObs(args: string[]): Promise<void> {
  const opts = parseObsOptions(args);

  if (opts.help) {
    showObsHelp();
    return;
  }
  if (opts.error) {
    console.error(`错误: ${opts.error}`);
    console.error(`参考: ${BIN_NAME} obs --help`);
    process.exitCode = 1;
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(`请先运行 \`${BIN_NAME} login <api-key>\` 或设置 SKILLS_API_KEY 环境变量`);
    process.exitCode = 1;
    return;
  }

  if (opts.subcommand === 'list') {
    const result = await marketProvider.listObservability(apiKey);
    if (!result.ok) {
      reportApiFailure(result);
      return;
    }
    printObservabilityList(result.data, readLocalPilotStatus());
    return;
  }

  if (opts.subcommand === 'refresh') {
    const result = await marketProvider.renewObservability(opts.agentId!, apiKey);
    if (!result.ok) {
      reportApiFailure(result);
      if (result.status === 404) {
        console.error('提示: 接入记录不存在，或该记录相关凭证已失效');
      }
      return;
    }
    console.log('✓ 已换发安装凭证');
    console.log(`  serviceName: ${result.data.serviceName}`);
    console.log(`  macOS/Linux: ${result.data.installCommand.unix}`);
    console.log(`  Windows:     ${result.data.installCommand.windows}`);
    console.log(
      '  注意: 旧凭证已立即失效；新凭证 5 分钟内有效且仅能使用一次（请复制对应你系统的命令执行）'
    );
    return;
  }

  if (opts.subcommand === 'install') {
    // 复用换发链路拿新凭证，随后确认后在本机执行（安装对象默认就是本机，按宿主平台选命令）
    const result = await marketProvider.renewObservability(opts.agentId!, apiKey);
    if (!result.ok) {
      reportApiFailure(result);
      if (result.status === 404) {
        console.error('提示: 接入记录不存在，或该记录相关凭证已失效');
      }
      return;
    }
    const command = pickPlatformCommand(result.data.installCommand);
    console.log(`  serviceName: ${result.data.serviceName}`);
    console.log(`  安装命令: ${command}`);
    // 本机检查：先告知现状再决定是否二次确认（防止无意覆盖本地配置）
    const localStatus = readLocalPilotStatus();
    if (localStatus.serviceName != null && localStatus.hasBinary) {
      console.log(
        `  本机检测: 已安装 LoongSuite Pilot (serviceNamePrefix: ${localStatus.serviceName}${localStatus.isRunning === false ? '，服务未运行' : ''})`
      );
      if (localStatus.serviceName === result.data.serviceName) {
        console.log('  目标接入已安装在本机，再次执行将重装并覆盖本地配置');
      } else {
        console.log('  本机当前指向另一条接入，再次执行将切换 serviceNamePrefix');
      }
    } else if (localStatus.serviceName != null) {
      console.log(
        `  本机检测: 检测到配置残留 (serviceNamePrefix: ${localStatus.serviceName})，未发现程序文件；重新安装通常会修复`
      );
    }
    // 仅在「配置 + 程序文件」都在时才二次确认；残留配置场景重装即修复，走普通确认
    const needDoubleConfirm = localStatus.serviceName != null && localStatus.hasBinary;
    const confirmed = await p.confirm({
      message: needDoubleConfirm
        ? '本机已存在 LoongSuite Pilot 安装，确认要再次执行安装？'
        : '立即在本机执行上面的安装命令？（凭证一次性、5 分钟有效）',
    });
    if (p.isCancel(confirmed) || !confirmed) {
      console.log('已取消；命令 5 分钟内仍可手动执行');
      return;
    }
    console.log('开始执行安装…（脚本输出见下方）');
    try {
      await runInstallCommand(command);
      console.log('✓ 安装命令执行完成');
    } catch (err) {
      console.error(`安装失败: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.subcommand === 'uninstall') {
    // 先做本机检查：配置与程序文件都缺失才视为未安装，不发请求也不执行脚本
    const localStatus = readLocalPilotStatus();
    if (localStatus.serviceName == null && !localStatus.hasBinary) {
      console.log('本机未检测到 LoongSuite Pilot 安装，无需卸载');
      return;
    }
    if (localStatus.hasBinary) {
      console.log(
        `  本机检测: 已安装 LoongSuite Pilot${localStatus.serviceName != null ? ` (serviceNamePrefix: ${localStatus.serviceName})` : ''}${localStatus.isRunning === false ? '，服务未运行' : ''}`
      );
    } else {
      console.log(
        `  本机检测: 检测到配置残留 (serviceNamePrefix: ${localStatus.serviceName})，未发现程序文件`
      );
    }
    const command = pickPlatformCommand(buildUninstallCommand(opts.purge ?? false));
    console.log(`  卸载命令: ${command}`);
    const confirmed = await p.confirm({
      message: opts.purge
        ? '将卸载 LoongSuite Pilot 并删除本地数据（配置与采集记录），确认继续？'
        : '将卸载 LoongSuite Pilot（保留 ~/.loongsuite-pilot 本地数据），确认继续？',
    });
    if (p.isCancel(confirmed) || !confirmed) {
      console.log('已取消');
      return;
    }
    console.log('开始执行卸载…（脚本输出见下方）');
    try {
      await runInstallCommand(command);
      console.log('✓ 卸载命令执行完成');
    } catch (err) {
      console.error(`卸载失败: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  // create
  const result = await marketProvider.createObservability(
    { agentName: opts.agentName!, note: opts.note },
    apiKey
  );
  if (!result.ok) {
    reportApiFailure(result);
    return;
  }
  const { data } = result;
  console.log(`✓ 已创建接入记录`);
  console.log(`  agentId: ${data.id}`);
  console.log(`  接入名: ${data.agentName}`);
  console.log(`  serviceName: ${data.serviceName}`);
  console.log(`  macOS/Linux: ${data.installCommand.unix}`);
  console.log(`  Windows:     ${data.installCommand.windows}`);
  console.log(
    `  凭证: 5 分钟内有效且仅能使用一次；过期或已使用后请 ${BIN_NAME} obs refresh ${data.id}`
  );
  // 本机检查：按分层状态提示下一步动作
  const localStatus = readLocalPilotStatus();
  if (localStatus.serviceName != null && localStatus.hasBinary) {
    console.log(
      `  本机检测: 已安装 LoongSuite Pilot (serviceNamePrefix: ${localStatus.serviceName})`
    );
    console.log(`  如需将本机切换到新接入，运行 \`${BIN_NAME} obs install ${data.id}\``);
  } else if (localStatus.serviceName != null) {
    console.log(
      `  本机检测: 检测到配置残留 (serviceNamePrefix: ${localStatus.serviceName})，未发现程序文件`
    );
    console.log(`  运行 \`${BIN_NAME} obs install ${data.id}\` 可重新安装并修复`);
  } else {
    console.log(
      `  本机检测: 未检测到 LoongSuite Pilot；运行 \`${BIN_NAME} obs install ${data.id}\` 可在本机安装`
    );
  }
}
