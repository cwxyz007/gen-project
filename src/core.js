const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const config = require('./config');
const Mustache = require('mustache');
const utils = require('./utils');
const { getConfigByLanguage } = require('./languageConfig');

config.author = utils.gitConfig();
config.project = path.parse(process.cwd()).name;

const pluginPath = path.join(__dirname, '..', 'plugin');

const pluginHelper = require('./pluginHelper');

/**
 *
 * @param {string} filePath
 * @param {IConfig} configs
 */
function render(filePath, configs) {
  const p = path.isAbsolute(filePath)
    ? filePath
    : path.join(__dirname, '..', filePath);

  return new Promise((resolve, reject) => {
    fs.readFile(p, { encoding: 'utf-8' }, (err, data) => {
      if (err) return reject(err);

      const hasMustache = /{{.+}}/.test(data);
      const content = hasMustache ? Mustache.render(data, configs) : data;
      resolve(content);
    });
  });
}

async function installPlugins(plugins) {
  for (let i = 0; i < plugins.length; i++) {
    const p = path.join(pluginPath, plugins[i]);

    if (fs.existsSync(p)) {
      const plugin = require(p);
      await plugin.install(pluginHelper);
    }
  }
}

/**
 * @returns {{useTs: boolean, plugins: string[]}}
 */
async function prompts() {
  return await inquirer.prompt([
    {
      name: 'useTs',
      type: 'confirm',
      message: 'Use typescript?',
      default: false,
    },
    {
      name: 'plugins',
      type: 'checkbox',
      message: 'Select plugins',
      choices: fs.readdirSync(pluginPath).concat(Object.keys(config.plugins)),
    },
  ]);
}

/**
 *
 * @param {'ts'|'js'} lang
 */
function applyLanguageConfig(lang) {
  const langConfig = getConfigByLanguage(lang);

  if (!langConfig) {
    return console.warn('No config for:', lang);
  }

  pluginHelper.addPackages(
    langConfig.packages.dependencies,
    langConfig.packages.devDependencies,
  );

  pluginHelper.addTemplates(langConfig.templates);
}

/**
 *
 * @param {IConfig} conf
 * @returns {IConfig}
 */
function mergeWithConfig(conf) {
  if (!conf) {
    return config;
  }

  conf.project = config.project;
  conf.author = config.author;

  return conf;
}

/**
 *
 * @param {string} projectPath
 * @param {IConfig} [presetConfig]
 */
async function genProject(projectPath, presetConfig) {
  if (!projectPath) {
    return console.warn('incorrect path:', projectPath);
  }

  if (!presetConfig) {
    const answer = await prompts();
    applyLanguageConfig(answer.useTs ? 'ts' : 'js');
    const plugins = answer.plugins || [];
    await installPlugins(plugins);
  }

  const currConfig = mergeWithConfig(presetConfig);

  const templates = currConfig.templates;

  for (let i = 0, max = templates.length; i < max; i++) {
    const tpl = templates[i].tpl;
    const p = templates[i].path;
    const content = await render(tpl, currConfig);
    //save file
    await utils.ufs.saveFile(path.join(projectPath, p), content);
  }
}

module.exports = genProject;
