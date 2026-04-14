#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd $SCRIPT_DIR

DIST_DIR=$(realpath "$SCRIPT_DIR/dist")
TEST_SITES=$(realpath "$SCRIPT_DIR/toolproof-tests/test-sites")

npx -y toolproof --placeholders dist_dir="$DIST_DIR" test_sites="$TEST_SITES" -i
