#!/usr/bin/env bash
# ============ Our Moments · GitHub Pages 一键部署 ============
# 用法：export GITHUB_TOKEN=xxx && bash scripts/deploy.sh
# 流程：确保仓库存在 → 上传站点文件到 main → 启用 Pages
# 说明：跳过 photos.json / messages.json / photos/，不覆盖线上用户数据
set -euo pipefail

OWNER="yuzengyang"
REPO="moment"
BRANCH="main"
TOKEN="${GITHUB_TOKEN:-}"
API="https://api.github.com"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$TOKEN" ]; then
  echo "错误：需要设置 GITHUB_TOKEN 环境变量" >&2
  exit 1
fi

echo "==> 1/3 确保仓库存在：$OWNER/$REPO"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/repos/$OWNER/$REPO")
if [ "$code" = "404" ]; then
  created=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"$REPO\",\"description\":\"Our Moments · 温琳舒与于增洋的时光簿\",\"public\":true,\"auto_init\":true}" \
    "$API/user/repos")
  if echo "$created" | grep -q '"full_name"'; then
    echo "    已自动创建仓库"
  else
    code2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/repos/$OWNER/$REPO")
    if [ "$code2" = "200" ]; then
      echo "    仓库已存在（手动创建）"
    else
      echo "    仓库不存在，请手动创建：https://github.com/new （Repository name: $REPO，Public）" >&2
      exit 1
    fi
  fi
elif [ "$code" = "200" ]; then
  echo "    仓库已存在"
else
  echo "    检查仓库失败（HTTP $code）" >&2
fi

echo "==> 2/3 上传站点文件到 $BRANCH"

TMPD="${TMPDIR:-/tmp}"

upload_file() {
  local path="$1"
  local rel="$2"
  local b64tmp="$TMPD/om_b64_$$.txt"
  local payload_file="$TMPD/om_payload_$$.json"
  base64 -w 0 < "$path" > "$b64tmp"

  local sha=""
  sha=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/repos/$OWNER/$REPO/contents/$rel" \
    | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sha',''))" 2>/dev/null || true)

  python - "$rel" "$sha" "$b64tmp" > "$payload_file" <<'PY'
import json, sys
rel, sha, b64file = sys.argv[1], sys.argv[2], sys.argv[3]
content = open(b64file, 'rb').read().decode('ascii').strip()
payload = {"message": "deploy: " + rel, "content": content, "branch": "main"}
if sha:
    payload["sha"] = sha
print(json.dumps(payload))
PY

  local res
  res=$(curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
    --data-binary @"$payload_file" "$API/repos/$OWNER/$REPO/contents/$rel")
  rm -f "$b64tmp" "$payload_file"
  if echo "$res" | grep -q '"content"'; then
    echo "    OK  $rel"
  else
    echo "    FAIL $rel" >&2
    exit 1
  fi
}

cd "$DIR"
find . -type f \
  -not -path './.git/*' \
  -not -path './scripts/deploy.sh' \
  -not -path './photos/*' \
  -not -name 'photos.json' \
  -not -name 'messages.json' \
  -not -name '*.pyc' \
  | sed 's|^\./||' \
  | sort \
  | while read -r rel; do
      upload_file "./$rel" "$rel"
    done

echo "==> 3/3 启用 GitHub Pages"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d "{\"source\":{\"branch\":\"$BRANCH\",\"path\":\"/\"}}" \
  "$API/repos/$OWNER/$REPO/pages" >/dev/null 2>&1 || true

echo ""
echo "部署完成。站点地址：https://$OWNER.github.io/$REPO/"
echo "（已跳过 photos.json / messages.json / photos/，不覆盖线上用户数据）"
