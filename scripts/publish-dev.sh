#!/usr/bin/env bash
set -euo pipefail

# 开发版发布：生成唯一预发布版本号，并把 dev-v<版本> 标签推到 GitHub 镜像。
# 实际发布由 .github/workflows/publish.yml 以 --tag dev 执行；本地不执行 npm publish。
#
# 用法:
#   ./scripts/publish-dev.sh            # 计算版本 + 预检 + 打标签 + 推送
#   ./scripts/publish-dev.sh --dry-run  # 只计算与预检，不创建/推送标签
#
# 可覆盖的环境变量:
#   DEV_PUBLISH_REMOTE  推送目标远端（默认 old-origin，即 GitHub 镜像）
#   DEV_PUBLISH_BRANCH  允许发布的分支（默认 develop）

MODE="${1:-}"
REMOTE="${DEV_PUBLISH_REMOTE:-old-origin}"
EXPECTED_BRANCH="${DEV_PUBLISH_BRANCH:-develop}"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "错误: 当前处于 detached HEAD，请切到命名分支后再发布开发版" >&2
  exit 1
fi
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "错误: 开发版发布要求当前分支为 ${EXPECTED_BRANCH}，实际为 ${CURRENT_BRANCH}" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "错误: 工作区有未提交改动，请先处理后再发布开发版" >&2
  git status --short >&2
  exit 1
fi

CURRENT="$(node -p "require('./package.json').version")"
BASE_VER="${CURRENT%%-bmc*}"
BMC_VER="${CURRENT#*-bmc}"
if [[ "$BMC_VER" == "$CURRENT" ]]; then
  echo "错误: 当前版本号缺少 -bmc 段: $CURRENT" >&2
  exit 1
fi

BMC_MAJOR="${BMC_VER%%.*}"
BMC_REST="${BMC_VER#*.}"
BMC_MINOR="${BMC_REST%%.*}"
BMC_PATCH="${BMC_REST#*.}"
NEXT_PATCH=$((BMC_PATCH + 1))
STAMP="$(date +%Y%m%d%H%M)"
DEV_VER="${BASE_VER}-bmc${BMC_MAJOR}.${BMC_MINOR}.${NEXT_PATCH}-dev.${STAMP}"
TAG="dev-v${DEV_VER}"

echo "当前版本:   $CURRENT"
echo "开发版版本: $DEV_VER"
echo "标签:       $TAG"
echo "推送远端:   $REMOTE"
echo ""

if npm view "blueai-skills@${DEV_VER}" version 2>/dev/null | grep -q .; then
  echo "错误: npm 上已存在版本 ${DEV_VER}，请稍后重试（时间戳需唯一）" >&2
  exit 1
fi

if [[ -n "$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG" 2>/dev/null)" ]]; then
  echo "错误: 远端 ${REMOTE} 已存在标签 ${TAG}，请稍后重试" >&2
  exit 1
fi

if [[ "$MODE" == "--dry-run" ]]; then
  echo "dry-run: 预检通过，未创建或推送标签。"
  exit 0
fi

git tag "$TAG"
git push "$REMOTE" "$TAG"

echo ""
echo "已推送 ${TAG}，GitHub Actions 将以 npm dist-tag 'dev' 发布 ${DEV_VER}。"
echo "开发者安装: npx --yes blueai-skills@dev"
echo "查看进度: https://github.com/FE-runner/skills/actions"
