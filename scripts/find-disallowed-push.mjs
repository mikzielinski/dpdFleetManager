#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ALLOWED = new Set([
  '.html','.htm','.css','.scss','.sass','.less','.js','.mjs','.cjs','.jsx','.ts','.tsx','.vue','.svelte','.json','.yaml','.yml','.xml','.toml','.graphql','.gql','.env','.config','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.woff','.woff2','.ttf','.eot','.map','.md','.txt','.wasm','.webmanifest','.mp3','.mp4','.wav','.pdf','.zip','.gz','.bz2','.tar','.riv','.lottie','.csv','.avif','.heic','.heif','.otf','.mpg','.mpeg','.mov','.avi','.glb','.gltf','.hdr','.exr','.ktx','.ktx2','.basis','.frag','.vert','.hlsl','.glsl','.wgsl','.mdx','.liquibase','.properties','.ini','.cfg','.conf','.webm','.ogv','.oga','.opus','.aac','.flac','.apng','.cur','.ani','.bcmap','.ftl','.po','.pot','.res','.nuspec','.lock','.npmrc','.nvmrc','.editorconfig','.prettierrc','.eslintrc','.babelrc','.browserslistrc','.gitignore','.dockerignore','.npmignore','.cursorignore','.uipath','.uipx','.uix','.xaml','.cs','.csproj','.vb','.fs','.fsproj','.py','.ipynb','.sh','.bash','.ps1','.bat','.cmd','.dockerfile','.containerfile','.gradle','.kts','.kt','.java','.rb','.go','.rs','.swift','.m','.mm','.h','.hpp','.c','.cpp','.cc','.cxx','.sql','.db','.sqlite','.proto','.avsc','.pem','.crt','.cer','.key','.pub','.asc','.sig','.p12','.pfx','.drawio','.bpmn','.uml','.plantuml','.puml','.mmd','.mermaid','.dot','.gv','.nomnoml','.dsl','.rego','.hcl','.tf','.tfvars','.nomad','.cue','.nix','.dhall','.jsonnet','.libsonnet','.tpl','.handlebars','.hbs','.mustache','.ejs','.pug','.jade','.njk','.nunjucks','.twig','.liquid','.slim','.haml','.erb','.rhtml','.cshtml','.razor','.aspx','.ascx','.master','.skin','.resx','.resources','.plist','.strings','.stringsdict','.xcstrings','.xcconfig','.pbxproj','.storyboard','.xib','.nib','.xcassets','.xcworkspace','.xcodeproj','.entitlements','.provisionprofile','.mobileprovision','.appxmanifest','.appinstaller','.msix','.msixbundle','.appxbundle','.msixupload','.msixbundleupload','.wapproj','.wixproj','.wxs','.wxi','.wxl','.heat','.vdproj','.vbp','.vbs','.wsf','.wsc','.wsh','.reg','.inf','.manifest','.application','.deploy','.vsto','.clickonce','.xbap','.xps','.oxps','.fdf','.xfdf','.icc','.icm','.pbm','.pgm','.ppm','.pnm','.tga','.dds','.psd','.ai','.eps','.ps','.sketch','.fig','.xd','.afdesign','.afphoto','.afpub','.clip','.sai','.kra','.ora','.xcf','.blend','.max','.ma','.mb','.c4d','.fbx','.obj','.stl','.3mf','.step','.stp','.iges','.igs','.dwg','.dxf','.ifc','.rvt','.rfa','.nwd','.nwc','.nwf','.skp','.3ds','.dae','.collada','.x3d','.wrl','.vrml','.usdz','.usda','.usdc','.sbs','.sbsar','.spp','.spsm','.sppr','.spt','.sppainter','.zpr','.ztl','.zbp','.zbr','.ztl','.zpr','.zbp','.zbr','.ztl','.zpr','.zbp','.zbr']);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = 'dist';
const disallowed = [];

function walk(dir, rel = '') {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, relPath);
    } else {
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
      if (ext && !ALLOWED.has(ext)) disallowed.push(relPath);
    }
  }
}
walk(root);
console.log('Disallowed source files:', disallowed.length);
disallowed.slice(0, 40).forEach((f) => console.log(' ', f));
