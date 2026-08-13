# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is a fresh scaffold with no code yet — only a README and a Node.js `.gitignore`. There is no `package.json`, source directory, build tooling, or test setup in place.

## Intent

Per the README: a Node.js file uploader that lets people drop files for you (a simple drop-box style upload service).

## Working here

Since no stack decisions have been made yet, when starting implementation:
- Check for an existing `package.json` before assuming a framework, package manager, or dependency set — none currently exists.
- The `.gitignore` is the standard Node.js template (covers `node_modules/`, common build outputs like `.next`/`.nuxt`/`dist`, lockfiles/caches for npm/yarn/pnpm, and env files) — it is not itself a signal of which framework was chosen.
