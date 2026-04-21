#!/bin/bash
set -e

echo "Configuring nginx for backend.nexapay.space..."

# Create backend.nexapay.space configuration
sudo tee /etc/nginx/sites-available/backend.nexapay.space > /dev/null << 'EOF'
# Nginx config for backend.nexapay.space
# Direct access to the Rust API (NexaPay Node)
# Service runs on 127.0.0.1:8088

server {
    server_name backend.nexapay.space;

    # Needed for API payloads
    client_max_body_size 25m;

    # Rust API at root
    location / {
        proxy_pass http://127.0.0.1:8088/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;

        # CORS headers for API access
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "X-API-Key, X-Developer-Token, X-Account-Token, Content-Type, Authorization" always;
        add_header Access-Control-Allow-Credentials "true" always;

        # Handle preflight requests
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "X-API-Key, X-Developer-Token, X-Account-Token, Content-Type, Authorization";
            add_header Access-Control-Max-Age 1728000;
            add_header Content-Type "text/plain; charset=UTF-8";
            add_header Content-Length 0;
            return 204;
        }
    }

    listen [::]:443 ssl ipv6only=on;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/nexapay.space/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexapay.space/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = backend.nexapay.space) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name backend.nexapay.space;
    return 404;
}
EOF

echo "Created backend.nexapay.space configuration"

# Update nexapay.space configuration (remove /backend location)
sudo tee /etc/nginx/sites-available/nexapay.space > /dev/null << 'EOF'
# Nginx config for NexaPay on Azure VPS
# Uses current Docker-published ports:
# - Portal (Next.js): 127.0.0.1:3001
#
# IMPORTANT:
# Frontend backend base URL must be set to:
#   NEXT_PUBLIC_API_URL=https://backend.nexapay.space
# API is now served from backend.nexapay.space subdomain

server {
    server_name nexapay.space www.nexapay.space;

    # Needed for judge demo uploads (CIN images) and API payloads
    client_max_body_size 25m;

    # Next.js app only - API moved to backend.nexapay.space
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/nexapay.space/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/nexapay.space/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.nexapay.space) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = nexapay.space) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name nexapay.space www.nexapay.space;
    return 404; # managed by Certbot
}
EOF

echo "Updated nexapay.space configuration"

# Enable backend.nexapay.space site
sudo ln -sf /etc/nginx/sites-available/backend.nexapay.space /etc/nginx/sites-enabled/backend.nexapay.space

echo "Enabled backend.nexapay.space site"

# Test nginx configuration
echo "Testing nginx configuration..."
sudo nginx -t

# Reload nginx
echo "Reloading nginx..."
sudo systemctl reload nginx

echo "Nginx configuration updated successfully!"
echo ""
echo "Summary:"
echo "1. backend.nexapay.space -> http://127.0.0.1:8088 (Rust API)"
echo "2. nexapay.space -> http://127.0.0.1:3001 (Next.js portal)"
echo ""
echo "Next steps:"
echo "1. Add DNS A record for backend.nexapay.space pointing to 20.199.106.44"
echo "2. Update docker-compose.yml: set NEXT_PUBLIC_API_URL=https://backend.nexapay.space"
echo "3. Rebuild and restart portal container"
