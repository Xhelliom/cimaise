#!/usr/bin/env bash
# Liste les apps installées sur la TV (IDs à relire sur NOTRE TV, jamais recopiés).
# Lecture seule. Sortie brute sur stdout ; à consigner dans .local/ (IDs = secrets de projet).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars TV_IP
sdb_session 'sdb -s "$T" shell 0 applist'
