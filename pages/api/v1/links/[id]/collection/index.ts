import type { NextApiRequest, NextApiResponse } from "next";
import verifyUser from "@/lib/api/verifyUser";
import { prisma } from "@/lib/api/db";
import getPermission from "@/lib/api/getPermission";
import { UsersAndCollections } from "@prisma/client";
import { Link } from ".prisma/client";

export default async function links(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  const link = await getLink({ req, res })
  if (!link) return;

  const collection = await verifyCollection({ req, res })
  if (!collection) return;


  if (req.method !== "PUT") {
    return res.status(405).json({
      response: "Method not allowed.",
    });
  }

  console.log(link.id, link.collectionId, req.body.collectionId)
};

const getLink = async ({ req, res }: { req: NextApiRequest, res: NextApiResponse }): Promise<Link | null> => {
  const link = await prisma.link.findUnique({
    where: {
      id: Number(req.query.id),
    },
    include: { collection: { include: { owner: true } } },
  });

  if (!link) {
    res.status(404).json({
      response: "Link not found.",
    });
    return null
  }

  return link
}

const verifyCollection = async
