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
const RESERVED_OBS_KEYWORDS = new Set(['add', 'list', 'refresh', 'install']);

export type ObsSubcommand = 'create' | 'list' | 'refresh' | 'install';

export interface ObsOptions {
  subcommand?: ObsSubcommand;
  /** create：接入名（agentName） */
  agentName?: string;
  /** create：可选备注 */
  note?: string;
  /** refresh/install：agentId 原始字符串 */
  agentId?: string;
  help: boolean;
  /** 本地参数校验/保留字冲突错误消息（非空时命令应立即失败，不发起请求） */
  error?: string;
}

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
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--note') {
      note = args[++i];
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
  obs add <agentName> [--note <note>]
                           Same as above (add is an alias)
  obs list                 List your observability records (each row shows agentId)
  obs refresh <agentId>    Generate a new install token (old ones are invalidated immediately)
  obs install <agentId>    Generate a new install token AND run it on this machine

Options:
  --note <note>    Optional note for the record
  --help, -h       Show this help message
`);
}

/**
 * 打印接入清单。每条记录必须打印 `agentId`（`obs refresh <agentId>` 所需 id 由此获取）。
 * 接入为单一 loongsuite 方案：不印 Agent 类型列。
 */
function printObservabilityList(
  records: Array<{
    id: string;
    agentName: string;
    note?: string | null;
    serviceName: string;
    createdAt: string;
  }>
): void {
  if (records.length === 0) {
    console.log('暂无接入记录。运行 `' + BIN_NAME + ' obs <agentName>` 创建。');
    return;
  }
  console.log(`共 ${records.length} 条接入记录:`);
  for (const record of records) {
    const noteSuffix = record.note ? ` (备注: ${record.note})` : '';
    console.log(
      `#${record.id}  ${record.agentName}  ${record.serviceName}  ${record.createdAt}${noteSuffix}`
    );
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
 * `skills obs …` 命令：创建接入记录 / 列出接入清单 / 按 agentId 换发安装 token / 本机执行安装。
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
    printObservabilityList(result.data);
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
    const confirmed = await p.confirm({
      message: '立即在本机执行上面的安装命令？（凭证一次性、5 分钟有效）',
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
}
