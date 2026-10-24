import os from 'os';
import path from 'path';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { writeSitePages, PAGES } from '../server/utils/privacy/pages.js';

/*
  The privacy policy and the data-deletion page are written into the site like kempo's starter pages: written
  when missing, replaced while the owner has not changed them, and kept once they have.
*/

const fresh = () => mkdtemp(path.join(os.tmpdir(), 'kempo-oauth-pages-'));

export default {
  'installing writes both pages, and doing it again changes nothing': async ({ pass, fail }) => {
    const cwd = await fresh();
    try {
      const first = writeSitePages({ cwd });
      if(first.map(page => page.status).join() !== 'written,written') return fail(`first run: ${JSON.stringify(first)}`);
      const second = writeSitePages({ cwd });
      if(second.map(page => page.status).join() !== 'current,current') return fail(`second run: ${JSON.stringify(second)}`);
      for(const { path: file } of PAGES) if(!existsSync(path.join(cwd, file))) return fail(`${file} was not written`);
      pass('');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  },

  'a page the owner has edited is kept on update, and one they deleted stays deleted': async ({ pass, fail }) => {
    const cwd = await fresh();
    try {
      writeSitePages({ cwd });
      const privacy = path.join(cwd, 'public/privacy/index.page.html');
      await writeFile(privacy, '<page title="Ours"><content><p>Our own wording</p></content></page>');
      const again = writeSitePages({ cwd });
      if(again.find(page => page.path.startsWith('public/privacy')).status !== 'kept') return fail(`edited: ${JSON.stringify(again)}`);
      if(!(await readFile(privacy, 'utf8')).includes('Our own wording')) return fail('the owner’s edit was overwritten');

      await rm(path.join(cwd, 'public/data-deletion'), { recursive: true, force: true });
      const deleted = writeSitePages({ cwd });
      if(deleted.find(page => page.path.startsWith('public/data-deletion')).status !== 'deleted') return fail(`deleted: ${JSON.stringify(deleted)}`);
      if(existsSync(path.join(cwd, 'public/data-deletion/index.page.html'))) return fail('a deleted page came back');
      pass('');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  },

  'the pages have the facts they fill in, the account deletion link, and the status component': async ({ pass, fail }) => {
    const privacy = PAGES.find(page => page.path.includes('privacy')).content;
    const deletion = PAGES.find(page => page.path.includes('data-deletion')).content;
    for(const fact of ['siteName', 'operator', 'contact', 'providers']) if(!privacy.includes(`data-fact="${fact}"`)) return fail(`privacy page has no ${fact} fact`);
    if(!privacy.includes('href="/delete-account/"') || !deletion.includes('href="/delete-account/"')) return fail('a page does not link to deleting the account');
    if(!deletion.includes('<k-oauth-deletion-status>')) return fail('the data-deletion page has no status component');
    if(!privacy.includes('PolicyFacts.js') || !deletion.includes('DeletionStatus.js')) return fail('a page does not load its script');
    pass('');
  },
};
