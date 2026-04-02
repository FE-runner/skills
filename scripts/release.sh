#!/usr/bin/env bash
set -euo pipefail

# blueai-skills 发布脚本
# 用法:
#   ./scripts/release.sh patch    # 0.0.1 -> 0.0.2
#   ./scripts/release.sh minor    # 0.0.1 -> 0.1.0
#   ./scripts/release.sh major    # 0.0.1 -> 1.0.0
#   ./scripts/release.sh          # 默认 patch

BUMP_TYPE="${1:-patch}"
REMOTE="old-origin"
BRANCH="master"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "错误: 无效的升级类型 '$BUMP_TYPE'"
  echo "用法: $0 [patch|minor|major]"
  exit 1
fi

# 读取当前版本
CURRENT=$(node -p "require('./package.json').version")
echo "当前版本: $CURRENT"

# 解析 bmc 版本号: 1.4.7-bmc1.2.0 -> base=1.4.7, bmc=1.2.0
BASE_VER=$(echo "$CURRENT" | sed 's/-bmc.*//')
BMC_VER=$(echo "$CURRENT" | sed -n 's/.*-bmc//p')

if [ -z "$BMC_VER" ]; then
  echo "错误: 版本号不包含 -bmc 后缀: $CURRENT"
  exit 1
fi

BMC_MAJOR=$(echo "$BMC_VER" | cut -d. -f1)
BMC_MINOR=$(echo "$BMC_VER" | cut -d. -f2)
BMC_PATCH=$(echo "$BMC_VER" | cut -d. -f3)

case "$BUMP_TYPE" in
  major)
    BMC_MAJOR=$((BMC_MAJOR + 1))
    BMC_MINOR=0
    BMC_PATCH=0
    ;;
  minor)
    BMC_MINOR=$((BMC_MINOR + 1))
    BMC_PATCH=0
    ;;
  patch)
    BMC_PATCH=$((BMC_PATCH + 1))
    ;;
esac

NEW_VER="${BASE_VER}-bmc${BMC_MAJOR}.${BMC_MINOR}.${BMC_PATCH}"
echo "新版本:   $NEW_VER"
echo ""

# 确认
read -p "确认发布 $NEW_VER? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "已取消"
  exit 0
fi

# 检查工作区是否干净
if [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "警告: 工作区有未提交的更改:"
  git status --short
  echo ""
  read -p "是否先提交这些更改? (y/N) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git add -A
    git commit -m "chore: pre-release changes"
  else
    echo "请先处理未提交的更改"
    exit 1
  fi
fi

# 升版本号
npm version "$NEW_VER" -m "v%s"

# 推送代码和 tag
echo ""
echo "推送到 $REMOTE/$BRANCH ..."
git push "$REMOTE" "$BRANCH"
git push "$REMOTE" "v${NEW_VER}"

echo ""
echo "发布完成! v${NEW_VER} 已推送，GitHub Actions 将自动发布到 npm。"
echo "查看进度: https://github.com/FE-runner/skills/actions"
