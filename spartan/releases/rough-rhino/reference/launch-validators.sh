#!/bin/bash

# Directory containing .env files
ENV_DIR="."
BASE_CONFIG="${ENV_DIR}/.env-baseconfig-val"

# Function to extract number from env file name
get_validator_number() {
    local filename="$1"
    echo "$filename" | grep -o '[0-9]\+' || echo "0"
}

# Function to launch a validator
launch_validator() {
    local env_file="$1"
    local validator_num=$(get_validator_number "$env_file")
    local container_name="aztec-validator-${validator_num}"
    
    echo "Launching validator $validator_num using $env_file..."
    
    # Create unique project name for each validator
    local project_name="aztec-val-${validator_num}"
    
    # Launch the validator with both env files
    docker compose -f docker-compose-val.yaml \
        --env-file "$BASE_CONFIG" \
        --env-file "$env_file" \
        -p "$project_name" \
        up -d
    
    echo "Validator $validator_num launched with project name $project_name"
}

# Function to stop a validator
stop_validator() {
    local env_file="$1"
    local validator_num=$(get_validator_number "$env_file")
    local project_name="aztec-val-${validator_num}"
    
    echo "Stopping validator $validator_num..."
    docker compose -f docker-compose-val.yaml \
        --env-file "$BASE_CONFIG" \
        --env-file "$env_file" \
        -p "$project_name" \
        down
}

# Main script
case "$1" in
    "start")
        # Check if base config exists
        if [ ! -f "$BASE_CONFIG" ]; then
            echo "Error: Base config file $BASE_CONFIG not found"
            exit 1
        fi
        
        # Launch all validators
        for env_file in ${ENV_DIR}/.env-val*; do
            if [ -f "$env_file" ]; then
                launch_validator "$env_file"
            fi
        done
        ;;
        
    "stop")
        # Stop all validators
        for env_file in ${ENV_DIR}/.env-val*; do
            if [ -f "$env_file" ]; then
                stop_validator "$env_file"
            fi
        done
        ;;
        
    "restart")
        # Restart all validators
        $0 stop
        sleep 5
        $0 start
        ;;
        
    *)
        echo "Usage: $0 {start|stop|restart}"
        exit 1
        ;;
esac