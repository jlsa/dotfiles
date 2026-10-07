#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target_dir="${HOME}/.local/bin"
target="${target_dir}/ccs"

if ! command -v bun >/dev/null 2>&1; then
  printf 'Bun is required for the TUI: https://bun.sh\n' >&2
  exit 1
fi

(cd "$repo_dir" && bun install)
mkdir -p "$target_dir"
ln -sfn "$repo_dir/bin/ccs" "$target"

printf 'ccs has been installed as %s\n' "$target"
case ":$PATH:" in
  *":$target_dir:"*) ;;
  *)
    printf '\nAdd this to your shell configuration once:\n'
    printf '  export PATH="$HOME/.local/bin:$PATH"\n'
    ;;
esac
