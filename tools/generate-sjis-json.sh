#!/bin/bash
set -e

self=$(realpath $0)
cd "${self%/*}"

cc -o sjis src/sjis.c

{
  echo {
  ./sjis 2 | sort | sed -r -z 's/,\n$/\n/g'
  echo }
} > ../conf/sjis.json

rm -f sjis
