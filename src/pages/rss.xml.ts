import { SITE } from "src/config";
import rss from "@astrojs/rss";
import type { Frontmatter } from "src/types";
import type { MarkdownInstance } from "astro";
import slugify from "@utils/slugify";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";
const parser = new MarkdownIt();

const postImportResult = import.meta.glob<MarkdownInstance<Frontmatter>>(
  "../contents/**/**/*.md",
  {
    eager: true,
  }
);
const posts = Object.values(postImportResult);

export const get = () =>
  rss({
    title: SITE.title,
    description: SITE.desc,
    site: SITE.website,
    items: posts
      .filter(({ frontmatter }) => !frontmatter.draft)
      .map(post => ({
        link: slugify(post.frontmatter),
        title: post.frontmatter.title,
        content: sanitizeHtml(parser.render(post.rawContent())),
        description: post.frontmatter.description,
        pubDate: new Date(post.frontmatter.datetime),
      })),
    // items: postImportResult,
  });
