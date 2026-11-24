import { LIBRARY_SUBDIRS } from "./paths";

export const COVERS_SUBDIR = "_covers";

export function coversDir(libraryRoot: string): string {
  return `${libraryRoot.replace(/[/\\]+$/, "")}/${LIBRARY_SUBDIRS.books}/${COVERS_SUBDIR}`;
}

export function coverCachePath(libraryRoot: string, slug: string): string {
  return `${coversDir(libraryRoot)}/${slug}.png`;
}

export function coverCustomPath(libraryRoot: string, slug: string): string {
  return `${coversDir(libraryRoot)}/${slug}-custom.png`;
}

export function coverMetaPath(libraryRoot: string, slug: string): string {
  return `${coversDir(libraryRoot)}/${slug}.json`;
}