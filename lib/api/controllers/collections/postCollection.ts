import { prisma } from "@/lib/api/db";
import { CollectionIncludingMembersAndLinkCount } from "@/types/global";
import { existsSync, mkdirSync } from "fs";

export default async function postCollection(
  collection: CollectionIncludingMembersAndLinkCount,
  userId: number
) {
  if (!collection || collection.name.trim() === "")
    return {
      response: "Please enter a valid collection.",
      status: 400,
    };

  const findCollection = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      collections: {
        where: {
          name: collection.name,
        },
      },
    },
  });

  const checkIfCollectionExists = findCollection?.collections[0];

  if (checkIfCollectionExists)
    return { response: "Collection already exists.", status: 400 };

  const newCollection = await prisma.collection.create({
    data: {
      owner: {
        connect: {
          id: userId,
        },
      },
      name: collection.name,
      description: collection.description,
      color: collection.color,
      members: {
        create: collection.members.map((e) => ({
          user: { connect: { email: e.user.email } },
          canCreate: e.canCreate,
          canUpdate: e.canUpdate,
          canDelete: e.canDelete,
        })),
      },
    },
    include: {
      _count: {
        select: { links: true },
      },
      members: {
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const collectionPath = `data/archives/${newCollection.id}`;
  if (!existsSync(collectionPath))
    mkdirSync(collectionPath, { recursive: true });

  return { response: newCollection, status: 200 };
}