import React from "react";
import { GetServerSideProps } from "next";
import { prisma } from "@/lib/api/db";
import { ArchivedFormat } from "@/types/global";
import readFile from "@/lib/api/storage/readFile";

import RSS from "rss";
import { json } from "stream/consumers";

const RSSFeed: React.FC = () => null;

export const getServerSideProps: GetServerSideProps = async ({
  params,
  query,
  res,
  req,
}) => {
  const id = Number(params?.id as string);
  const format = Number(query?.format as string)

  if (isNaN(id) || !id) {
    if (res) {
      res.statusCode = 404;
      res.end();
    }
    return { props: {} };
  }

  const data = await prisma.collection.findUnique({
    where: {
      id,
      isPublic: true,
    },
    include: {
      links: {
        orderBy: {
          id: "desc",
        },
        take: 20,
      },
    },
  });

  if (!data) {
    res.statusCode = 404;
    res.end("Not Found");
    return { props: {} };
  }

  const host = req.headers.host;

  const protocol =
    req.headers["x-forwarded-proto"] || (req.socket ? "https" : "http");
  const siteUrl = `${protocol}://${host}/public/collections/${data.id}`;
  const feedUrl = `${protocol}://${host}/public/collections/${data.id}/rss`;

  const feed = new RSS({
    title: data.name,
    description: data.description,
    site_url: siteUrl,
    feed_url: feedUrl,
    custom_namespaces: {
      'media': "http://search.yahoo.com/mrss/",
    },
    custom_elements: [
      { 'content:encoded': 'encoded' },
      { 'media:thumbnail': 'thumbnail' }
    ]
  });


  for (const link of data.links) {
    const item = {
      title: link.name,
      description: link.description,
      url: link.url,
      date: link.createdAt,
      enclosure: {
        url: `${protocol}://${host}/public/preserved/${link.id}?format=${ArchivedFormat.pdf}`,
        type: "application/pdf"
      }
    } as RSS.ItemOptions

    const { file, status } = await readFile(
      `archives/${data.id}/${link.id}_readability.json`
    );

    if (status === 200) {
      const result = JSON.parse(file.toString())
      
      item.description = result.excerpt || link.description
      item.custom_elements = [{
        'content:encoded': `<![CDATA[${result.content}]]>`,
        'media.content': {
          url: `${protocol}://${host}/public/preserved/${link.id}?format=${ArchivedFormat.pdf}`,
          type: 'application/pdf'
        },
        'media.thumbnail': {
          url: `${protocol}://${host}/api/v1/archives/${link.id}?format=${ArchivedFormat.jpeg}&preview=true`,
          type: 'media/jpeg'
        }
      }]
    }

    feed.item(item)
  }


  const xml = feed.xml({ indent: true });

  if (res) {
    res.setHeader("Content-Type", "text/xml");
    res.write(xml);
    res.end();
  }

  return { props: {} };
};

export default RSSFeed;
