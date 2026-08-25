import { marketProvider } from './providers/market.ts';
import type { ObservabilityAgentType } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

/**
 * 支持的观测 Agent 类型（v1 仅 hermes / openclaw），与市场侧模板枚举一致。
 */
const OBSERVABILITY_AGENT_TYPES: ObservabilityAgentType[] = ['hermes', 'openclaw'];

/**
 * 子命令/别名关键字。`obs list` / `obs refresh` 已有子命令语义，
 * `obs add <name>` 与 `obs <name>` 等价（add 为 create 语义的别名），
 * 因此这些关键字不能再被当作接入名（agentName）。
 */
const RESERVED_OBS_KEYWORDS = new Set(['add', 'list', 'refresh']);

export type ObsSubcommand = 'create' | 'list' | 'refresh';

export interface ObsOptions {
  subcommand?: ObsSubcommand;
  /** create：接入名（agentName） */
  agentName?: string;
  /** create：--agent 传入的原始值 */
  agentType?: string;
  /** create：可选备注 */
  note?: string;
  /** refresh：agentId 原始字符串 */
  agentId?: string;
  help: boolean;
  /** 本地参数校验/保留字冲突错误消息（非空时命令应立即失败，不发起请求） */
  error?: string;
}

/**
 * 解析 `skills obs …` 子命令参数。
 *
 * - `obs <agentName> --agent <type> [--note …]`（`add` 作为 create 别名可跳过）→ create
 * - `obs list`　→ list（仅接受该关键字，带 `--agent`/`--note` 时视为把 list 当接入名，报保留字冲突）
 * - `obs refresh <agentId>` → refresh（agentId 强制数字，`--agent`/`--note` 不适用）
 * - 位置参数/`--agent` 缺失、agent 类型非法、位置参数命中保留字时返回 `error`（本地拒绝）
 */
export function parseObsOptions(args: string[]): ObsOptions {
  const positionals: string[] = [];
  let agentType: string | undefined;
  let note: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--agent') {
      agentType = args[++i];
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
    return { help, error: '缺少子命令或接入名。用法: obs <agentName> --agent <hermes|openclaw>' };
  }

  if (first === 'list') {
    if (positionals.length > 1 || agentType || note) {
      return {
        help,
        error: `"list" 是子命令关键字，不能作为接入名。直接运行 \`${BIN_NAME} obs list\` 查看清单`,
      };
    }
    return { help, subcommand: 'list' };
  }

  if (first === 'refresh') {
    if (positionals.length < 2) {
      return { help, error: '缺少 agentId。用法: obs refresh <agentId>' };
    }
    if (positionals.length > 2 || agentType || note) {
      return { help, error: 'refresh 只接受一个 agentId 位置参数' };
    }
    const agentId = positionals[1];
    if (!agentId || !/^\d+$/.test(agentId)) {
      return { help, error: `agentId 必须是数字，收到 "${agentId}"` };
    }
    return { help, subcommand: 'refresh', agentId };
  }

  // create 语义（`add` 为可选别名，跳过取下一个位置参数为 agentName）
  const isAddAlias = first === 'add';
  const agentName = isAddAlias ? positionals[1] : first;

  if (agentName === undefined) {
    return { help, error: '缺少接入名。用法: obs [add] <agentName> --agent <hermes|openclaw>' };
  }
  if (RESERVED_OBS_KEYWORDS.has(agentName)) {
    return { help, error: `"${agentName}" 是子命令关键字，不能作为接入名（agentName）。` };
  }
  if (positionals.length > (isAddAlias ? 2 : 1)) {
    return {
      help,
      error: '多余的位置参数。用法: obs <agentName> --agent <hermes|openclaw> [--note ……]',
    };
  }
  if (!agentType) {
    return {
      help,
      error: `缺少 --agent（${OBSERVABILITY_AGENT_TYPES.join('/')}），创建接入记录必填。`,
    };
  }
  const isSupportedType = (OBSERVABILITY_AGENT_TYPES as string[]).includes(agentType);
  if (!isSupportedType) {
    return {
      help,
      error: `不支持的 Agent 类型 "${agentType}"，支持: ${OBSERVABILITY_AGENT_TYPES.join('/')}`,
    };
  }

  return { help, subcommand: 'create', agentName, agentType, note };
}

/**
 * 展示 `skills obs --help` 用法。供 `obs --help`/`-h` 与 `skills --help` 复用文案约定。
 */
export function showObsHelp(): void {
  console.log(`
Usage: ${BIN_NAME} obs <command> [options]

Manage Agent observability records (shared with the Market web dashboard).

Commands:
  obs <agentName> --agent <hermes|openclaw> [--note <note>]
                           Create an observability record and print its install command
  obs add <agentName> --agent <hermes|openclaw> [--note <note>]
                           Same as above (add is an alias)
  obs list                 List your observability records (each row shows agentId)
  obs refresh <agentId>    Generate a new install token (old one is invalidated immediately)

Options:
  --agent <type>   Agent type, required for create (hermes | openclaw)
  --note <note>    Optional note for the record
  --help, -h       Show this help message
`);
}

/**
 * 打印接入清单。每条记录必须打印 `agentId`（`obs refresh <agentId>` 所需 id 由此获取）。
 */
function printObservabilityList(
  records: Array<{
    id: number;
    agentType: string;
    agentName: string;
    note?: string | null;
    serviceName: string;
    createdAt: string;
  }>
): void {
  if (records.length === 0) {
    console.log(
      '暂无接入记录。运行 `' + BIN_NAME + ' obs <agentName> --agent <hermes|openclaw>` 创建。'
    );
    return;
  }
  console.log(`共 ${records.length} 条接入记录:`);
  for (const record of records) {
    const noteSuffix = record.note ? ` (备注: ${record.note})` : '';
    console.log(
      `#${record.id}  ${record.agentType}  ${record.agentName}  ${record.serviceName}  ${record.createdAt}${noteSuffix}`
    );
  }
  console.log(`换发安装凭证: ${BIN_NAME} obs refresh <agentId>`);
}

/**
 * `skills obs …` 命令：创建接入记录 / 列出接入清单 / 按 agentId 换发安装 token。
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
    // agentId 经 parse 校验为数字字符串，转 number 匹配市场侧 z.number() 契约
    const result = await marketProvider.renewObservability(Number(opts.agentId), apiKey);
    if (!result.ok) {
      reportApiFailure(result);
      if (result.status === 404) {
        console.error('提示: 接入记录不存在，或该记录相关凭证已失效');
      }
      return;
    }
    console.log('✓ 已换发安装凭证');
    console.log(`  serviceName: ${result.data.serviceName}`);
    console.log(`  安装命令: ${result.data.installCommand}`);
    console.log('  注意: 旧凭证已立即失效；新凭证 5 分钟内有效且仅能使用一次');
    return;
  }

  // create
  const result = await marketProvider.createObservability(
    { agentType: opts.agentType!, agentName: opts.agentName!, note: opts.note },
    apiKey
  );
  if (!result.ok) {
    reportApiFailure(result);
    return;
  }
  const { data } = result;
  console.log(`✓ 已创建接入记录`);
  console.log(`  agentId: ${data.id}`);
  console.log(`  类型: ${data.agentType}`);
  console.log(`  接入名: ${data.agentName}`);
  console.log(`  serviceName: ${data.serviceName}`);
  console.log(`  安装命令: ${data.installCommand}`);
  console.log(
    `  凭证: 5 分钟内有效且仅能使用一次；过期或已使用后请 ${BIN_NAME} obs refresh ${data.id}`
  );
}
