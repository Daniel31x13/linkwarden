import { prisma } from "@/lib/api/db";
import { LinkIncludingShortenedCollectionAndTags } from "@/types/global";
import fs from "fs";
import { Collection, Link, UsersAndCollections } from "@prisma/client";
import getPermission from "@/lib/api/getPermission";

export default async function deleteLink(
  link: LinkIncludingShortenedCollectionAndTags,
  userId: number
) {
  if (!link || !link.collectionId)
    return { response: "Please choose a valid link.", status: 401 };

  const collectionIsAccessible = (await getPermission(
    userId,
    link.collectionId
  )) as
    | (Collection & {
        members: UsersAndCollections[];
      })
    | null;

  const memberHasAccess = collectionIsAccessible?.members.some(
    (e: UsersAndCollections) => e.userId === userId && e.canDelete
  );

  if (!(collectionIsAccessible?.ownerId === userId || memberHasAccess))
    return { response: "Collection is not accessible.", status: 401 };

  const deleteLink: Link = await prisma.link.delete({
    where: {
      id: link.id,
    },
  });

  fs.unlink(`data/archives/${link.collectionId}/${link.id}.pdf`, (err) => {
    if (err) console.log(err);
  });

  fs.unlink(`data/archives/${link.collectionId}/${link.id}.png`, (err) => {
    if (err) console.log(err);
  });

  return { response: deleteLink, status: 200 };
}