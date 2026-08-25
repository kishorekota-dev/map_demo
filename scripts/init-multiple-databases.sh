#!/bin/bash
# Script to initialize multiple PostgreSQL databases
# This is run automatically by postgres container on first start

set -e
set -u

function create_user_and_database() {
	local database="$1"
	local exists

	exists=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
		--tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = '$database';")

	if [ "$exists" = "1" ]; then
		echo "  Database '$database' already exists; skipping"
		return
	fi

	echo "  Creating database '$database'"
	psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
		--set=database="$database" --set=owner="$POSTGRES_USER" <<-'EOSQL'
	    CREATE DATABASE :"database";
	    GRANT ALL PRIVILEGES ON DATABASE :"database" TO :"owner";
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
	echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
	IFS=',' read -r -a databases <<< "$POSTGRES_MULTIPLE_DATABASES"
	for db in "${databases[@]}"; do
		create_user_and_database "$db"
	done
	echo "Multiple databases created"
fi
