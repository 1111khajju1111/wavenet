# WaveNet Deployment and Configuration

## Project Structure
```
wavenet/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   └── utils/
├── frontend/
│   ├── lib/
│   ├── pubspec.yaml
│   ├── android/
│   ├── ios/
│   ├── web/
│   └── assets/
├── dashboard/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
├── docker-compose.yml
└── README.md
```

## Backend Setup (Node.js + Express)

### package.json
```json
{
  "name": "wavenet-backend",
  "version": "1.0.0",
  "description": "WaveNet Ocean Hazard Monitoring Backend",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.5.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.8.1",
    "multer": "^1.4.5-lts.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "joi": "^17.9.2",
    "winston": "^3.10.0",
    "dotenv": "^16.3.1",
    "axios": "^1.5.0",
    "@huggingface/inference": "^2.6.4",
    "node-cron": "^3.0.2",
    "socket.io": "^4.7.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.4"
  }
}
```

### Environment Variables (.env)
```bash
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:8080

# Database
MONGODB_URI=mongodb://localhost:27017/wavenet

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here

# API Keys
GEMINI_API_KEY=your-gemini-api-key
HUGGINGFACE_API_KEY=your-huggingface-api-key
MAPBOX_ACCESS_TOKEN=your-mapbox-access-token

# Social Media APIs
TWITTER_BEARER_TOKEN=your-twitter-bearer-token
FACEBOOK_ACCESS_TOKEN=your-facebook-access-token
YOUTUBE_API_KEY=your-youtube-api-key

# File Upload
MAX_FILE_SIZE=50MB
UPLOAD_PATH=./uploads

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Redis (for caching and sessions)
REDIS_URL=redis://localhost:6379
```

## Flutter Frontend Setup

### pubspec.yaml
```yaml
name: wavenet
description: Ocean Hazard Crowdsourcing Platform
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'
  flutter: '>=3.10.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  
  # State Management
  provider: ^6.0.5
  riverpod: ^2.4.0
  flutter_riverpod: ^2.4.0
  
  # UI Components
  material_color_utilities: ^0.5.0
  google_fonts: ^6.1.0
  flutter_svg: ^2.0.7
  cached_network_image: ^3.3.0
  
  # Maps and Location
  flutter_map: ^6.0.1
  latlong2: ^0.8.1
  geolocator: ^10.1.0
  geocoding: ^2.1.1
  mapbox_gl: ^0.16.0
  
  # HTTP and API
  http: ^1.1.0
  dio: ^5.3.2
  retrofit: ^4.0.1
  json_serializable: ^6.7.1
  
  # Database and Storage
  sqflite: ^2.3.0
  idb_shim: ^2.4.1
  shared_preferences: ^2.2.2
  secure_storage: ^3.1.0
  
  # Media and Files
  image_picker: ^1.0.4
  video_player: ^2.7.2
  file_picker: ^6.1.1
  path_provider: ^2.1.1
  
  # Internationalization
  intl: ^0.18.1
  flutter_gen: ^5.3.2
  
  # Utilities
  uuid: ^4.1.0
  connectivity_plus: ^5.0.1
  permission_handler: ^11.0.1
  device_info_plus: ^9.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1
  build_runner: ^2.4.7
  retrofit_generator: ^7.0.8
  json_annotation: ^4.8.1

flutter:
  uses-material-design: true
  generate: true
  
  assets:
    - assets/images/
    - assets/icons/
    - assets/translations/
  
  fonts:
    - family: Roboto
      fonts:
        - asset: fonts/Roboto-Regular.ttf
        - asset: fonts/Roboto-Bold.ttf
          weight: 700
```

## Docker Configuration

### docker-compose.yml
```yaml
version: '3.8'

services:
  # MongoDB Database
  mongodb:
    image: mongo:7.0
    container_name: wavenet-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password123
      MONGO_INITDB_DATABASE: wavenet
    volumes:
      - mongodb_data:/data/db
      - ./backend/scripts/init-mongo.js:/docker-entrypoint-initdb.d/init-mongo.js:ro
    networks:
      - wavenet-network

  # Redis for caching and sessions
  redis:
    image: redis:7.2-alpine
    container_name: wavenet-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - wavenet-network

  # Backend API Server
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: wavenet-backend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://admin:password123@mongodb:27017/wavenet?authSource=admin
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./backend/uploads:/app/uploads
      - ./backend/logs:/app/logs
    depends_on:
      - mongodb
      - redis
    networks:
      - wavenet-network

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: wavenet-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./frontend/build/web:/usr/share/nginx/html/app:ro
      - ./dashboard:/usr/share/nginx/html/dashboard:ro
    depends_on:
      - backend
    networks:
      - wavenet-network

volumes:
  mongodb_data:
  redis_data:

networks:
  wavenet-network:
    driver: bridge
```

### Backend Dockerfile
```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads logs

# Set permissions
RUN chown -R node:node /app
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["node", "server.js"]
```

## Nginx Configuration

### nginx/nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=uploads:10m rate=2r/s;
    
    # Upstream backend
    upstream wavenet_backend {
        server backend:3000;
    }
    
    # Main server configuration
    server {
        listen 80;
        server_name localhost;
        
        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        
        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://wavenet_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # Increase timeout for file uploads
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }
        
        # File upload endpoint with special rate limiting
        location /api/reports {
            limit_req zone=uploads burst=5 nodelay;
            client_max_body_size 50M;
            
            proxy_pass http://wavenet_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            proxy_read_timeout 600s;
            proxy_send_timeout 600s;
        }
        
        # Static file serving for uploads
        location /uploads/ {
            alias /app/uploads/;
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }
        
        # Flutter Web App
        location /app/ {
            alias /usr/share/nginx/html/app/;
            try_files $uri $uri/ /app/index.html;
            
            # Cache static assets
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }
        
        # D3.js Dashboard
        location /dashboard/ {
            alias /usr/share/nginx/html/dashboard/;
            index index.html;
            try_files $uri $uri/ /dashboard/index.html;
        }
        
        # Default redirect to app
        location / {
            return 301 /app/;
        }
        
        # Health check
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

## Ngrok Deployment Configuration

### ngrok.yml
```yaml
version: 2
authtoken: YOUR_NGROK_AUTH_TOKEN

tunnels:
  wavenet-web:
    proto: http
    addr: 80
    subdomain: wavenet-demo
    inspect: false
    bind_tls: true
    
  wavenet-api:
    proto: http
    addr: 3000
    subdomain: wavenet-api
    inspect: true
    bind_tls: true
    
  wavenet-websocket:
    proto: http
    addr: 3001
    subdomain: wavenet-ws
    bind_tls: true
```

### Deployment Scripts

#### deploy.sh
```bash
#!/bin/bash

# WaveNet Deployment Script

set -e

echo "🌊 WaveNet Deployment Starting..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed. Please install ngrok first."
    exit 1
fi

# Environment setup
if [ ! -f "backend/.env" ]; then
    echo "❌ Backend .env file not found. Please create it first."
    exit 1
fi

# Build Flutter Web
echo "📱 Building Flutter web application..."
cd frontend
flutter clean
flutter pub get
flutter build web --release
cd ..

# Copy Flutter build to nginx directory
echo "📁 Copying Flutter build files..."
rm -rf nginx/html/app
mkdir -p nginx/html/app
cp -r frontend/build/web/* nginx/html/app/

# Copy dashboard files
echo "📊 Copying dashboard files..."
rm -rf nginx/html/dashboard
mkdir -p nginx/html/dashboard
cp -r dashboard/* nginx/html/dashboard/

# Start services with Docker Compose
echo "🐳 Starting Docker services..."
docker-compose down
docker-compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🔍 Checking service health..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Nginx is healthy"
else
    echo "❌ Nginx health check failed"
fi

if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
fi

# Start ngrok tunnels
echo "🌐 Starting ngrok tunnels..."
pkill -f ngrok || true
sleep 2

# Start ngrok in background
nohup ngrok start --config ngrok.yml --all > ngrok.log 2>&1 &

# Wait for ngrok to initialize
sleep 5

# Get ngrok URLs
NGROK_WEB_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[] | select(.name == "wavenet-web") | .public_url')
NGROK_API_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[] | select(.name == "wavenet-api") | .public_url')

echo ""
echo "🎉 WaveNet Deployment Complete!"
echo ""
echo "🌐 Web Application: $NGROK_WEB_URL/app/"
echo "📊 Analytics Dashboard: $NGROK_WEB_URL/dashboard/"
echo "🔗 API Endpoint: $NGROK_API_URL"
echo ""
echo "📱 Flutter Web: Access the main application"
echo "📈 D3.js Dashboard: Real-time analytics and visualization"
echo "🔧 API: Backend services for mobile and web clients"
echo ""
echo "📝 Logs:"
echo "   - Backend: docker logs wavenet-backend"
echo "   - Nginx: docker logs wavenet-nginx"
echo "   - MongoDB: docker logs wavenet-mongodb"
echo "   - Ngrok: tail -f ngrok.log"
echo ""
```

#### stop.sh
```bash
#!/bin/bash

echo "🛑 Stopping WaveNet services..."

# Stop ngrok
pkill -f ngrok || true

# Stop Docker services
docker-compose down

# Clean up
docker system prune -f

echo "✅ WaveNet services stopped"
```

#### setup.sh
```bash
#!/bin/bash

# WaveNet Initial Setup Script

echo "🌊 WaveNet Initial Setup..."

# Check system requirements
echo "🔍 Checking system requirements..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# Check Flutter
if ! command -v flutter &> /dev/null; then
    echo "❌ Flutter is not installed"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

# Check ngrok
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed"
    exit 1
fi

echo "✅ All requirements satisfied"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Install Flutter dependencies
echo "📦 Installing Flutter dependencies..."
cd frontend
flutter pub get
cd ..

# Setup environment files
if [ ! -f "backend/.env" ]; then
    echo "⚙️  Creating backend .env file..."
    cp backend/.env.example backend/.env
    echo "✏️  Please edit backend/.env with your API keys"
fi

if [ ! -f "ngrok.yml" ]; then
    echo "⚙️  Creating ngrok configuration..."
    cp ngrok.yml.example ngrok.yml
    echo "✏️  Please edit ngrok.yml with your auth token"
fi

# Create necessary directories
mkdir -p backend/uploads
mkdir -p backend/logs
mkdir -p nginx/html
mkdir -p nginx/ssl

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your API keys"
echo "2. Edit ngrok.yml with your ngrok auth token"
echo "3. Run ./deploy.sh to start the application"
echo ""
```

## API Keys Required

1. **Google Gemini API Key** - Get from Google AI Studio
2. **Hugging Face API Key** - Get from Hugging Face Hub
3. **Mapbox Access Token** - Get from Mapbox account
4. **Twitter Bearer Token** - Get from Twitter Developer Portal
5. **Facebook Access Token** - Get from Facebook Developers
6. **YouTube Data API Key** - Get from Google Cloud Console
7. **Ngrok Auth Token** - Get from ngrok dashboard

## Deployment Commands

```bash
# Initial setup
chmod +x setup.sh deploy.sh stop.sh
./setup.sh

# Deploy application
./deploy.sh

# Stop application
./stop.sh
```

The application will be available at the ngrok URLs provided after deployment, offering a complete cross-platform ocean hazard monitoring solution with beautiful UI, real-time data processing, and comprehensive analytics.