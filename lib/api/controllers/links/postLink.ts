import { prisma } from "@/lib/api/db";
import { LinkIncludingShortenedCollectionAndTags } from "@/types/global";
import getTitle from "../../getTitle";
import archive from "../../archive";
import { Collection, Link, UsersAndCollections } from "@prisma/client";
import getPermission from "@/lib/api/getPermission";
import { existsSync, mkdirSync } from "fs";

export default async function postLink(
  link: LinkIncludingShortenedCollectionAndTags,
  userId: number
) {
  link.collection.name = link.collection.name.trim();

  if (!link.name) {
    return { response: "Please enter a valid name for the link.", status: 400 };
  } else if (!link.collection.name) {
    return { response: "Please enter a valid collection.", status: 400 };
  }

  if (link.collection.id) {
    const collectionIsAccessible = (await getPermission(
      userId,
      link.collection.id
    )) as
      | (Collection & {
          members: UsersAndCollections[];
        })
      | null;

    const memberHasAccess = collectionIsAccessible?.members.some(
      (e: UsersAndCollections) => e.userId === userId && e.canCreate
    );

    if (!(collectionIsAccessible?.ownerId === userId || memberHasAccess))
      return { response: "Collection is not accessible.", status: 401 };
  } else {
    link.collection.ownerId = userId;
  }

  const description =
    link.description && link.description !== ""
      ? link.description
      : await getTitle(link.url);

  const newLink: Link = await prisma.link.create({
    data: {
      name: link.name,
      url: link.url,
      description,
      collection: {
        connectOrCreate: {
          where: {
            name_ownerId: {
              ownerId: link.collection.ownerId,
              name: link.collection.name,
            },
          },
          create: {
            name: link.collection.name,
            ownerId: userId,
          },
        },
      },
      tags: {
        connectOrCreate: link.tags.map((tag) => ({
          where: {
            name_ownerId: {
              name: tag.name,
              ownerId: link.collection.ownerId,
            },
          },
          create: {
            name: tag.name,
            owner: {
              connect: {
                id: link.collection.ownerId,
              },
            },
          },
        })),
      },
    },
    include: { tags: true, collection: true },
  });

  const collectionPath = `data/archives/${newLink.collectionId}`;
  if (!existsSync(collectionPath))
    mkdirSync(collectionPath, { recursive: true });

  archive(newLink.url, newLink.collectionId, newLink.id);

  return { response: newLink, status: 200 };
}