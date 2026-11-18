#!/bin/bash
# jedna hodnota parametru: tools/tune.sh '{"floor":5}' [soupeř] [hry]
node tools/arena.js "v2:hard:$1" "${2:-v1:hard}" "${3:-400}" 2 1000
