#!/usr/bin/env bash
# Launches the UDTL web dev server pinned to Node 22 (the project's required
# version — the shell default is v14 which breaks Next 15 / supabase-js).
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd /Users/avisekhgurung/Desktop/its-work/UDTL
exec npm run dev
