#!/bin/bash
# Management commands for BidBeacon Server

SERVER="zknicker@5.161.181.165"
SSH_KEY="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Business/MerchBase/SSH/hetzner"
REMOTE_DIR="/opt/bidbeacon-server"

SSH_CMD="ssh -i \"$SSH_KEY\" $SERVER"

case "$1" in
  logs)
    echo "📄 Viewing container logs..."
    $SSH_CMD "docker logs -f bidbeacon-server"
    ;;
  logs-tail)
    echo "📄 Viewing last 50 log lines..."
    $SSH_CMD "docker logs --tail 50 bidbeacon-server"
    ;;
  restart)
    echo "🔄 Restarting container..."
    $SSH_CMD "cd $REMOTE_DIR && docker compose restart"
    echo "✅ Container restarted"
    ;;
  stop)
    echo "⏹️  Stopping container..."
    $SSH_CMD "cd $REMOTE_DIR && docker compose down"
    echo "✅ Container stopped"
    ;;
  start)
    echo "▶️  Starting container..."
    $SSH_CMD "cd $REMOTE_DIR && docker compose up -d"
    echo "✅ Container started"
    ;;
  status)
    echo "📊 Checking container status..."
    $SSH_CMD "docker ps | grep bidbeacon || echo '❌ Container not running'"
    echo ""
    echo "🏥 Health check..."
    $SSH_CMD "docker exec bidbeacon-server wget -q --spider http://localhost:8080/api/health && echo '✅ Health check passed' || echo '❌ Health check failed'"
    ;;
  shell)
    echo "🐚 Opening shell in container..."
    $SSH_CMD "docker exec -it bidbeacon-server sh"
    ;;
  update-env)
    echo "📝 Updating environment file..."
    if [ -f ".env.production" ]; then
      scp -i "$SSH_KEY" .env.production "$SERVER:$REMOTE_DIR/.env"
      echo "✅ Environment file updated"
      echo "🔄 Restart container to apply changes: ./commands.sh restart"
    else
      echo "❌ .env.production not found locally"
    fi
    ;;
  test)
    echo "🧪 Testing API endpoint..."
    echo "Health check:"
    curl -s "http://5.161.181.165:8081/api/health" | jq . || echo "❌ Health check failed"
    echo "Test endpoint:"
    curl -s "http://5.161.181.165:8081/api/test" | jq . || echo "❌ Test endpoint failed"
    ;;
  monitor)
    echo "📈 Monitoring container (Ctrl+C to stop)..."
    while true; do
      clear
      echo "=== BidBeacon Server Status ==="
      echo "Time: $(date)"
      echo ""
      $SSH_CMD "docker stats bidbeacon-server --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}'" 2>/dev/null || echo "❌ Container not running"
      sleep 5
    done
    ;;
  *)
    echo "BidBeacon Server Management Commands"
    echo ""
    echo "Usage: $0 {command}"
    echo ""
    echo "Commands:"
    echo "  logs        - View live container logs"
    echo "  logs-tail   - View last 50 log lines"
    echo "  restart     - Restart the container"
    echo "  stop        - Stop the container"
    echo "  start       - Start the container"
    echo "  status      - Check container status and health"
    echo "  shell       - Open shell in container"
    echo "  update-env  - Update environment variables"
    echo "  test        - Test API endpoints"
    echo "  monitor     - Monitor container stats"
    echo ""
    echo "Examples:"
    echo "  $0 logs        # View logs"
    echo "  $0 status      # Check if running"
    echo "  $0 test        # Test the API"
    ;;
esac

