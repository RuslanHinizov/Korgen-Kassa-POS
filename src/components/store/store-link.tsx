"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { useStorePath } from "./store-provider";

type Props = Omit<LinkProps, "href"> & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/**
 * Drop-in replacement for next/link's <Link>: same props, but `href` is an
 * app-relative path (e.g. "/products") that gets the current store prefixed
 * onto it automatically. Only external/absolute hrefs (http…) pass through unchanged.
 */
export const StoreLink = forwardRef<HTMLAnchorElement, Props>(function StoreLink({ href, ...props }, ref) {
  const storePath = useStorePath();
  const resolved = /^([a-z]+:)?\/\//i.test(href) ? href : storePath(href);
  return <Link ref={ref} href={resolved} {...props} />;
});
