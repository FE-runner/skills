import { defineBuildConfig } from 'obuild/config';

const PROD_SKILLS_SITE = 'https://blueai-skills-market.bluemediagroup.cn';
const DEV_SKILLS_SITE = 'https://blueai-skills-market.domob-inc.cn';
const isDevBuild = process.env.SKILLS_BUILD_TARGET === 'dev';

// 构建期注入默认值：dev 构建连内网测试市场并显示 @dev；正式构建保持生产市场与 @latest。
// 两个量都显式注入为字面量，避免运行时环境变量改变默认行为。
const define = {
  'process.env.SKILLS_DEFAULT_SITE': JSON.stringify(isDevBuild ? DEV_SKILLS_SITE : PROD_SKILLS_SITE),
  'process.env.BLUEAI_NPX_TAG': JSON.stringify(isDevBuild ? 'dev' : 'latest'),
};

// https://github.com/unjs/obuild
export default defineBuildConfig({
  entries: [{ type: 'bundle', input: './src/cli.ts', rolldown: { transform: { define } } }],
});
