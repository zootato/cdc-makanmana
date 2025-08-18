#!/bin/bash

# Setup 2 AM Daily Cron Job for CDC Data Refresh
# This script sets up an automated daily refresh at 2:00 AM

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="$PROJECT_DIR/scripts/enhanced-nightly-refresh.js"
LOG_PATH="$PROJECT_DIR/data/cron.log"

echo -e "${BLUE}=== CDC GoWhere - 2 AM Cron Job Setup ===${NC}"
echo "Project directory: $PROJECT_DIR"
echo "Script path: $SCRIPT_PATH"
echo "Log path: $LOG_PATH"
echo ""

# Check if the refresh script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo -e "${RED}❌ Error: Refresh script not found at $SCRIPT_PATH${NC}"
    exit 1
fi

# Make the script executable
chmod +x "$SCRIPT_PATH"
echo -e "${GREEN}✅ Made refresh script executable${NC}"

# Create data directory if it doesn't exist
mkdir -p "$PROJECT_DIR/data"
echo -e "${GREEN}✅ Created data directory${NC}"

# Create environment file for cron
ENV_FILE="$PROJECT_DIR/.env.cron"
cat > "$ENV_FILE" << EOF
# Environment variables for cron job
GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY:-""}
NODE_PATH=$(which node)
PROJECT_DIR=$PROJECT_DIR
EOF

echo -e "${GREEN}✅ Created environment file: $ENV_FILE${NC}"

# Create the cron job entry
CRON_ENTRY="0 2 * * * cd $PROJECT_DIR && /usr/bin/env bash -c 'source $ENV_FILE && \$NODE_PATH $SCRIPT_PATH >> $LOG_PATH 2>&1'"

echo -e "${YELLOW}Cron job entry:${NC}"
echo "$CRON_ENTRY"
echo ""

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "enhanced-nightly-refresh.js"; then
    echo -e "${YELLOW}⚠️  Cron job already exists. Updating...${NC}"
    # Remove existing entry and add new one
    (crontab -l 2>/dev/null | grep -v "enhanced-nightly-refresh.js"; echo "$CRON_ENTRY") | crontab -
else
    echo -e "${BLUE}Adding new cron job...${NC}"
    # Add new entry to existing crontab
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
fi

# Verify the cron job was added
if crontab -l 2>/dev/null | grep -q "enhanced-nightly-refresh.js"; then
    echo -e "${GREEN}✅ Cron job successfully added!${NC}"
    echo ""
    echo -e "${BLUE}Current crontab:${NC}"
    crontab -l | grep "enhanced-nightly-refresh.js"
    echo ""
else
    echo -e "${RED}❌ Error: Failed to add cron job${NC}"
    exit 1
fi

# Create initial log file
touch "$LOG_PATH"
echo -e "${GREEN}✅ Created log file: $LOG_PATH${NC}"

# Test the script (optional)
echo -e "${YELLOW}Do you want to test the refresh script now? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${BLUE}Running test refresh...${NC}"
    cd "$PROJECT_DIR"
    source "$ENV_FILE"
    node "$SCRIPT_PATH"
    echo -e "${GREEN}✅ Test completed. Check the logs for results.${NC}"
fi

echo ""
echo -e "${GREEN}=== Setup Complete! ===${NC}"
echo -e "${BLUE}The cron job will run daily at 2:00 AM and:${NC}"
echo "• Fetch fresh CDC voucher data"
echo "• Enhance with Google Maps Places API"
echo "• Fallback to OneMap Business Directory"
echo "• Verify Halal status"
echo "• Export to CSV and JSON files"
echo "• Log all activities"
echo ""
echo -e "${YELLOW}Important notes:${NC}"
echo "• Set GOOGLE_MAPS_API_KEY environment variable for best results"
echo "• Check logs at: $LOG_PATH"
echo "• Data files will be saved in: $PROJECT_DIR/data/"
echo "• To remove cron job: crontab -e (then delete the line)"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "• View cron jobs: crontab -l"
echo "• Edit cron jobs: crontab -e"
echo "• View logs: tail -f $LOG_PATH"
echo "• Manual run: cd $PROJECT_DIR && node $SCRIPT_PATH"
