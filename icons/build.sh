#!/usr/bin/env bash
# Regenerates every PNG icon from the two SVG sources.
#
#   ./icons/build.sh
#
# Needs Inkscape (rendering) and ImageMagick (flattening the Apple icon).
# Edit icons/icon.svg — icon-maskable.svg is the same art at a smaller scale, so
# keep the two in step when you change the artwork.

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
icons="$root/icons"

render() {   # render <source.svg> <size> <output.png>
  # Inkscape resolves relative paths against $HOME, so always hand it absolutes.
  inkscape --export-type=png --export-filename="$icons/$3" -w "$2" -h "$2" "$icons/$1" >/dev/null 2>&1
  echo "  $3  (${2}x${2})"
}

echo "from icon.svg:"
render icon.svg 512 icon-512.png
render icon.svg 192 icon-192.png
render icon.svg 32  favicon-32.png
render icon.svg 180 apple-touch-icon.png

echo "from icon-maskable.svg:"
render icon-maskable.svg 512 icon-maskable-512.png
render icon-maskable.svg 192 icon-maskable-192.png

# iOS composites a transparent touch icon onto black, so make sure there is no
# alpha channel to composite.
magick "$icons/apple-touch-icon.png" -background '#5B41A0' -alpha remove -alpha off \
  "$icons/apple-touch-icon.png"
echo "flattened apple-touch-icon.png"
