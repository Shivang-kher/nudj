.PHONY: wiki backend help

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

wiki: ## Start the Nudj wiki (docs site, port 3000)
	cd wiki && npm start

backend: ## Start the backend dev server (port 8000)
	cd nudj-backend && npm run dev
