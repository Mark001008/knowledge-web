#!/bin/sh
set -eu

: "${KB_API_BASE_URL:=}"

cat > /usr/share/nginx/html/config.js <<EOF
window.KB_API_BASE_URL = "${KB_API_BASE_URL}";
EOF

exec nginx -g "daemon off;"
