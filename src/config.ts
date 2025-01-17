import type { SocialsObject } from "./types";

export const SITE = {
  website: "https://jakegut.com",
  author: "Harish Vadaparty",
  desc: "A personal website",
  title: "Harish Vadaparty",
  lightAndDarkMode: true,
  postPerPage: 5,
};

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialsObject = [
  {
    name: "Github",
    href: "https://github.com/jakegut",
    active: true,
  },
  {
    name: "Linkedin",
    href: "https://linkedin.com/in/jakegut",
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:jakegut0108@gmail.com",
    active: true,
  },
  {
    name: "Mastodon",
    href: "https://hachyderm.io/@jakegut",
    active: true,
  },
];
