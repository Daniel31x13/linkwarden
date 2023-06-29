import { prisma } from "@/lib/api/db";
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";

interface Data {
  response: string | object;
}

interface User {
  name: string;
  email: string;
  password: string;
}

export default async function Index(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const body: User = req.body;

  if (!body.email || !body.password || !body.name)
    return res
      .status(400)
      .json({ response: "Please fill out all the fields." });

  const checkIfUserExists = await prisma.user.findFirst({
    where: {
      email: body.email,
    },
  });

  if (!checkIfUserExists) {
    const saltRounds = 10;

    const hashedPassword = bcrypt.hashSync(body.password, saltRounds);

    await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
      },
    });

    res.status(201).json({ response: "User successfully created." });
  } else if (checkIfUserExists) {
    res.status(400).json({ response: "User already exists." });
  }
}