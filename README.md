# PO File Translation Tool for ChatGPT

[![NPM version](https://img.shields.io/npm/v/gpt-po.svg)](https://npmjs.org/package/gpt-po)
[![Downloads](https://img.shields.io/npm/dm/gpt-po.svg)](https://npmjs.org/package/gpt-po)

Translation tool for gettext (po) files that supports custom system prompts and user dictionaries. It also supports translating specified po files to a designated target language and updating po files based on pot files.

**Supported LLM Providers:** OpenAI (GPT), Anthropic (Claude), and Google (Gemini)

Read in other languages: English | [简体中文](./README_zh-CN.md)

<a href="https://buymeacoffee.com/ryanhex" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-red.png" alt="Buy Me A Coffee" height="41" width="174"></a>

## Installation

```
npm install gpt-po
```

Set `API_KEY` before using this tool. Depending on the provider, use `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`.

**It is recommended to use paid APIs to improve translation speed, as free tiers are often slower and have usage restrictions.**

### Environment Variables
- `OPENAI_API_KEY`: OpenAI API key.
- `OPENAI_API_HOST`: OpenAI API host (default: `https://api.openai.com`).
- `ANTHROPIC_API_KEY`: Anthropic API key.
- `ANTHROPIC_API_HOST`: Anthropic API host.
- `GEMINI_API_KEY`: Google Gemini API key.
- `GEMINI_API_HOST`: Google Gemini API host.
- `MODEL_TMP`: Model temperature (default: 0.1). This will override provider-specific temperature settings.

## Usage Scenarios

- `gpt-po sync --po <file> --pot <file>` Update the po file based on the pot file, while preserving the original translations.
- `gpt-po --po <file>` Translate specified po files to a designated target language.
- `gpt-po --po <file> --lang <lang>` Translate specified po files to a designated target language (overriding language specified in po file).
- `gpt-po --dir .` Translate all po files in current directory to a designated target language.
- `gpt-po userdict` Modify or view user dictionaries
- `gpt-po userdict --explore` Explore user dictionaries, if you want add new dictionaries or modify existing dictionaries. dictionaries can be named as `dictionary-<lang>.json`, for example, `dictionary-zh.json` is the dictionary for Simplified Chinese.

```
Usage: gpt-po [options] [command]

command tool for translate po files by gpt

Options:
  -V, --version           output the version number
  -h, --help              display help for command

Commands:
  translate [options]     translate po file (default command)
  sync [options]          update po from pot file
  userdict [options]      open/edit user dictionary
  remove [options]        remove po entries by options
  help [command]          display help for command
```

```
Usage: gpt-po [options]

translate po file (default command)

Options:
  -p, --provider <provider>  API provider (choices: "openai", "anthropic", "gemini", default: "openai")
  -k, --key <key>            API key (can also be set via OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY)
  --host <host>              API host (can also be set via OPENAI_API_HOST, ANTHROPIC_API_HOST, GEMINI_API_HOST)
  --model <model>            Model to use (default: gpt-5-nano for openai, claude-haiku-4-5 for anthropic, gemini-2.5-flash for gemini, env: MODEL)
  --po <file>            po file path
  --dir <dir>            po file directory
  -src, --source <lang>  source language (default: "english")
  --verbose              show verbose log
  -l, --lang <lang>      target language (ISO 639-1 code)
  -o, --output <file>    output file path, overwirte po file by default
  --context <file>       context file path (provides additional context to the bot)
  --context-length <length>  Maximum accumulated length of source strings (msgid) to translate in each API request (default: 2000, env: API_CONTEXT_LENGTH)
  --timeout <ms>         Timeout in milliseconds for API requests (default: 20000, env: API_TIMEOUT)
  -h, --help             display help for command
```

```
Usage: gpt-po remove [options]

remove po entries by options

Options:
  --po <file>                       po file path
  --fuzzy                           remove fuzzy entries
  -obs, --obsolete                  remove obsolete entries
  -ut, --untranslated               remove untranslated entries
  -t, --translated                  remove translated entries
  -tnf, --translated-not-fuzzy      remove translated not fuzzy entries
  -ft, --fuzzy-translated           remove fuzzy translated entries
  -rc, --reference-contains <text>  remove entries whose reference contains text, text can be a regular expression like /text/ig
  -h, --help                        display help for command
```

```
Usage: gpt-po sync [options]

update po from pot file

Options:
  --po <file>   po file path
  --pot <file>  pot file path
  -h, --help    display help for command
```
