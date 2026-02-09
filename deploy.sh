#!/bin/bash
# Soccer Prediction AI - VPS Deployment Script
# Run this on your VPS after cloning the repo

set -e

echo "=== Spark AI Prediction - Deployment ==="

# 1. Install system dependencies
echo "[1/6] Installing system dependencies..."
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm nginx certbot python3-certbot-nginx

# 2. Set up Python virtual environment
echo "[2/6] Setting up Python environment..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "[!] No .env file found. Creating from template..."
    cp .env.example .env
    echo "[!] IMPORTANT: Edit backend/.env with your actual API keys!"
    echo "    nano backend/.env"
fi

# 4. Build frontend
echo "[3/6] Building frontend..."
cd ../frontend
npm install
npm run build

# 5. Create systemd service
echo "[4/6] Creating systemd service..."
sudo tee /etc/systemd/system/soccer-ai.service > /dev/null <<EOF
[Unit]
Description=Spark AI Prediction Backend
After=network.target

[Service]
User=$USER
WorkingDirectory=$(pwd)/../backend
EnvironmentFile=$(pwd)/../backend/.env
ExecStart=$(pwd)/../backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable soccer-ai
sudo systemctl start soccer-ai

# 6. Configure nginx
echo "[5/6] Configuring nginx..."
sudo tee /etc/nginx/sites-available/soccer-ai > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    # Serve React frontend
    root /home/DEPLOY_USER/Soccer_Prediction_AI/frontend/dist;
    index index.html;

    # API proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # React SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Replace DEPLOY_USER with actual username
sudo sed -i "s/DEPLOY_USER/$USER/g" /etc/nginx/sites-available/soccer-ai
sudo ln -sf /etc/nginx/sites-available/soccer-ai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo "[6/6] Deployment complete!"
echo ""
echo "=== Next Steps ==="
echo "1. Edit your API keys:  nano backend/.env"
echo "2. Restart the service: sudo systemctl restart soccer-ai"
echo "3. Add your domain and SSL: sudo certbot --nginx -d yourdomain.com"
echo ""
echo "Your app is running at: http://$(curl -s ifconfig.me)"
