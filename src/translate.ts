import Anthropic from "@anthropic-ai/sdk";
import { ContentListUnion, GoogleGenAI, GoogleGenAIOptions } from "@google/genai";
import * as fs from "fs";
import { GetTextPoCompilerOptions, GetTextTranslation } from "gettext-parser";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "../package.json" with { type: "json" };
import { compilePo, copyFileIfNotExists, findConfig, parsePo, printProgress } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _openai: OpenAI;
let _anthropic: Anthropic;
let _gemini: GoogleGenAI;
let _systemprompt: string;
let _userprompt: string;
let _userdict: { [lang: string]: { [key: string]: string } };

export function init(provider: string, force?: boolean): void {
  if (provider === "openai" && (!_openai || force)) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_HOST
        ? process.env.OPENAI_API_HOST.replace(/\/+$/, "") + "/v1"
        : undefined
    });
  } else if (provider === "anthropic" && (!_anthropic || force)) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_API_HOST ? process.env.ANTHROPIC_API_HOST.replace(/\/+$/, "") : undefined
    });
  } else if (provider === "gemini" && (!_gemini || force)) {
    const options: GoogleGenAIOptions = {
      apiKey: process.env.GEMINI_API_KEY || ""
    };
    if (process.env.GEMINI_API_HOST) {
      options.httpOptions = {
        baseUrl: process.env.GEMINI_API_HOST.replace(/\/+$/, "")
      };
    }
    _gemini = new GoogleGenAI(options);
  }

  // load systemprompt.txt from project
  if (!_systemprompt || force) {
    _systemprompt = fs.readFileSync(path.join(__dirname, "systemprompt.txt"), "utf-8");
  }
  // load userprompt.txt from project
  if (!_userprompt || force) {
    _userprompt = fs.readFileSync(path.join(__dirname, "userprompt.txt"), "utf-8");
  }
  // load dictionary.json from homedir
  if (!_userdict || force) {
    const userdict = findConfig("dictionary.json");
    copyFileIfNotExists(userdict, path.join(__dirname, "dictionary.json"));
    _userdict = { default: JSON.parse(fs.readFileSync(userdict, "utf-8")) };
  }
}

export async function translate(
  provider: string,
  src: string,
  lang: string,
  model: string,
  translations: GetTextTranslation[],
  contextFile: string,
  timeout: number
) {
  const lang_code = lang
    .toLowerCase()
    .trim()
    .replace(/[\W_]+/g, "-");

  const dicts = Object.entries(_userdict[lang_code] || _userdict["default"]).reduce(
    (acc, [k, v], idx) => {
      if (translations.some((tr) => tr.msgid.toLowerCase().includes(k.toLowerCase()))) {
        acc.user.push(`<translate index="${idx + 1}">${k}</translate>`);
        acc.assistant.push(`<translated index="${idx + 1}">${v}</translated>`);
      }
      return acc;
    },
    { user: <string[]>[], assistant: <string[]>[] }
  );

  const escapePseudoXmlAttr = (value: string): string =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r?\n/g, " &#10; ");

  const context = contextFile ? "\n\nContext: " + fs.readFileSync(contextFile, "utf-8") : "";

  const translationsContent = translations
    .map((tr, idx) => {
      const contextAttr = tr.msgctxt ? ` context="${escapePseudoXmlAttr(tr.msgctxt)}"` : "";
      const noteAttr = tr.comments?.extracted ? ` note="${escapePseudoXmlAttr(tr.comments.extracted)}"` : "";
      return `<translate index="${idx + dicts.user.length + 1}"${contextAttr}${noteAttr}>${tr.msgid}</translate>`;
    })
    .join("\n");

  const temperature = process.env.MODEL_TMP
    ? parseFloat(process.env.MODEL_TMP)
    : process.env.OPENAI_MODEL_TMP
      ? parseFloat(process.env.OPENAI_MODEL_TMP)
      : 0.1;
  const systemContent = _systemprompt + context;
  const initialUserContent = `${_userprompt}\n\nWait for my incoming message(s) in \`${src}\` and translate them into \`${lang}\` (\`${src}\` and \`${lang}\` are XPG/POSIX locale names, used in Unix-like systems and GNU Gettext).`;
  const initialAssistantContent = `Understood, I will translate your incoming \`${src}\` message(s) into \`${lang}\`, carefully following guidelines. Please go ahead and send your message(s) for translation.`;

  let content = "";

  if (provider === "openai") {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: initialUserContent },
      { role: "assistant", content: initialAssistantContent },
      ...(dicts.user.length > 0
        ? <ChatCompletionMessageParam[]>[
            { role: "user", content: dicts.user.join("\n") },
            { role: "assistant", content: dicts.assistant.join("\n") }
          ]
        : []),
      { role: "user", content: translationsContent }
    ];

    const res = await _openai.chat.completions.create(
      { model, temperature, messages },
      { timeout, stream: false }
    );
    content = res.choices[0].message.content ?? "";
  } else if (provider === "anthropic") {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: initialUserContent },
      { role: "assistant", content: initialAssistantContent },
      ...(dicts.user.length > 0
        ? <Anthropic.MessageParam[]>[
            { role: "user", content: dicts.user.join("\n") },
            { role: "assistant", content: dicts.assistant.join("\n") }
          ]
        : []),
      { role: "user", content: translationsContent }
    ];

    let res = await _anthropic.messages.create(
      { model, temperature, system: systemContent, messages, max_tokens: 4096 },
      { timeout }
    );

    if (typeof res === "string") {
      res = JSON.parse(res);
    }

    if (res.content && res.content.length > 0 && res.content[0].type === "text") {
      content = (res.content[0] as Anthropic.TextBlock).text;
    } else {
      console.error("Error: Anthropic response content is empty or not a text block.", res.content);
      content = ""; // Default to empty string or handle error appropriately
    }
  } else if (provider === "gemini") {
    const contents: ContentListUnion = [
      { role: "user", parts: [{ text: initialUserContent }] },
      { role: "model", parts: [{ text: initialAssistantContent }] },
      ...(dicts.user.length > 0
        ? <any[]>[
            { role: "user", parts: [{ text: dicts.user.join("\n") }] },
            { role: "model", parts: [{ text: dicts.assistant.join("\n") }] }
          ]
        : []),
      { role: "user", parts: [{ text: translationsContent }] }
    ];

    const res = await _gemini.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemContent,
        temperature,
        maxOutputTokens: 4096,
        httpOptions: { timeout }
      }
    });

    if (res.candidates && res.candidates.length > 0) {
      const candidate = res.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        content = candidate.content.parts[0].text || "";
      }
    }
  }

  translations.forEach((trans, idx) => {
    const tag = `<translated index="${idx + dicts.user.length + 1}">`;
    const s = content.indexOf(tag);
    if (s > -1) {
      const e = content.indexOf("</translated>", s);
      trans.msgstr[0] = content.slice(s + tag.length, e);
    } else {
      console.error("Error: Unable to find translation for string [" + trans.msgid + "]");
    }
  });
}

export async function translatePo(
  provider: string,
  model: string,
  po: string,
  source: string,
  lang: string,
  verbose: boolean,
  output: string,
  contextFile: string,
  contextLength: number,
  timeout: number,
  compileOptions?: GetTextPoCompilerOptions
) {
  const potrans = await parsePo(po);

  if (!lang) lang = potrans.headers["Language"];

  if (!lang) {
    console.error("No language specified via po file or args");
    return;
  }

  // try to load dictionary by lang-code if it not loaded
  const lang_code = lang
    .toLowerCase()
    .trim()
    .replace(/[\W_]+/g, "-");
  if (!_userdict[lang_code]) {
    const lang_dic_file = findConfig(`dictionary-${lang_code}.json`);
    if (fs.existsSync(lang_dic_file)) {
      _userdict[lang_code] = JSON.parse(fs.readFileSync(lang_dic_file, "utf-8"));
      console.log(`dictionary-${lang_code}.json is loaded.`);
    }
  }
  const list: Array<GetTextTranslation> = [];
  const trimRegx = /(?:^ )|(?: $)/;
  let trimed = false;
  for (const [ctx, entries] of Object.entries(potrans.translations)) {
    for (const [msgid, trans] of Object.entries(entries)) {
      if (msgid === "") continue;

      if (!trans.msgstr[0]) {
        list.push({
          msgctxt: trans.msgctxt || ctx,
          msgid,
          msgid_plural: trans.msgid_plural,
          msgstr: trans.msgstr,
          comments: trans.comments
        });
      } else if (trimRegx.test(trans.msgstr[0])) {
        trimed = true;
        trans.msgstr[0] = trans.msgstr[0].trim();
      }
    }
  }
  if (trimed) {
    await compilePo(potrans, po, compileOptions);
  }
  if (list.length == 0) {
    console.log("done.");
    return;
  }
  potrans.headers["Last-Translator"] = `gpt-po v${pkg.version}`;
  const translations = <GetTextTranslation[]>[];
  let err429 = false;
  for (let i = 0, c = 0; i < list.length; i++) {
    if (i == 0) printProgress(i, list.length);
    if (err429) {
      // sleep for 20 seconds.
      await new Promise((resolve) => setTimeout(resolve, 20000));
    }
    const trans = list[i];
    if (c < contextLength) {
      translations.push(trans);
      c += trans.msgid.length;
    }
    if (c >= contextLength || i == list.length - 1) {
      try {
        await translate(provider, source, lang, model, translations, contextFile, timeout);
        if (verbose) {
          translations.forEach((trans) => {
            console.log(trans.msgid);
            console.log(trans.msgstr[0]);
          });
        }
        translations.length = 0;
        c = 0;
        // update progress
        printProgress(i + 1, list.length);
        // save po file after each 2000 characters by default
        await compilePo(potrans, output || po, compileOptions);
      } catch (error: any) {
        if (error.response) {
          if (error.response.status == 429) {
            // caused by rate limit exceeded, should sleep for 20 seconds.
            err429 = true;
            --i;
          } else {
            console.error(error.response.status);
            console.log(error.response.data);
          }
        } else {
          console.error(error.message);
          if (error.code == "ECONNABORTED") {
            console.log('you may need to set "HTTPS_PROXY" to reach api.');
          }
        }
      }
    }
  }
  console.log("done.");
}

export async function translatePoDir(
  provider: string,
  model: string,
  dir: string,
  source: string,
  lang: string,
  verbose: boolean,
  contextFile: string,
  contextLength: number,
  timeout: number,
  compileOptions?: GetTextPoCompilerOptions
) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith(".po")) {
      const po = path.join(dir, file);
      console.log(`translating ${po}`);
      await translatePo(
        provider,
        model,
        po,
        source,
        lang,
        verbose,
        po,
        contextFile,
        contextLength,
        timeout,
        compileOptions
      );
    }
  }
}
