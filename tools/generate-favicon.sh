#!/bin/bash

set -e

srcfile=images/favicon.png

destdir=assets
for size in 192 512; do
	printf 'Generating android-chrome-%dx%d.png\n' $size $size
	convert \
		$srcfile \
		-background "rgb(29, 29, 29)" \
		-define png:compression-level=9 \
		-flatten \
		-resize ${size}x$size \
		-strip \
		$destdir/android-chrome-${size}x$size.png
done

printf 'Generating apple-touch-icon.png\n'
convert \
	$srcfile \
	-background "rgb(29, 29, 29)" \
	-define png:compression-level=9 \
	-flatten \
	-resize 180x180 \
	-strip \
	$destdir/apple-touch-icon.png

for size in 16 32; do
	printf 'Generating favicon-%dx%d.png\n' $size $size
	convert \
		$srcfile \
		-define png:compression-level=9 \
		-resize ${size}x$size \
		-strip \
		-transparent white \
		$destdir/favicon-${size}x$size.png
done

printf 'Generating favicon.ico\n'
convert \
	$srcfile \
	-define icon:auto-resize=32,16 \
	-strip \
	-transparent white \
	$destdir/favicon.ico

printf 'Generating koukoku-ogp.png for an OGP image\n'
convert \
	$srcfile \
	-background "rgb(29, 29, 29)" \
	-flatten \
	-resize 630x630 \
	-define png:compression-level=9 \
	-gravity center \
	-extent 1200x630 \
	-strip \
	$destdir/koukoku-ogp.png

printf 'Generating koukoku.png\n'
convert \
	$srcfile \
	-define png:compression-level=9 \
	-resize 112x112 \
	-strip \
	-transparent white \
	$destdir/koukoku.png
