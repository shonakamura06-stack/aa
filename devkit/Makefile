# Atajos del devkit. `make` sin argumentos muestra la ayuda.
.DEFAULT_GOAL := help
CHROME ?= /tmp/chromium
FIXTURE := test/fixtures/good.html

help: ## lista los objetivos
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

doctor: ## verifica el entorno
	@node bin/devkit.mjs doctor

tokens: ## regenera reference/tokens.*
	@node bin/tokens.mjs

test: ## 20 tests (unitarios + integración con navegador)
	@node --test test/*.test.mjs

gate: ## puerta de calidad sobre la interfaz de referencia
	@node bin/devkit.mjs check $(FIXTURE) --min-score 100 --max-errors 0

baseline: ## actualiza la baseline visual
	@node bin/devkit.mjs vdiff home $(FIXTURE) --viewport desktop --update

verify: ## secuencia completa que debe pasar antes de commitear
	@make test && make tokens && make gate

.PHONY: help doctor tokens test gate baseline verify
