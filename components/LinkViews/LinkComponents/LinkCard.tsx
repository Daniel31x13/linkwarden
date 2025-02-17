import {
  ArchivedFormat,
  CollectionIncludingMembersAndLinkCount,
  LinkIncludingShortenedCollectionAndTags,
} from "@/types/global";
import { useEffect, useMemo, useRef, useState } from "react";
import useLinkStore from "@/store/links";
import unescapeString from "@/lib/client/unescapeString";
import LinkActions from "@/components/LinkViews/LinkComponents/LinkActions";
import LinkDate from "@/components/LinkViews/LinkComponents/LinkDate";
import LinkCollection from "@/components/LinkViews/LinkComponents/LinkCollection";
import Image from "next/image";
import {
  atLeastOneFormatAvailable,
  formatAvailable,
} from "@/lib/shared/formatStats";
import LinkIcon from "./LinkIcon";
import useOnScreen from "@/hooks/useOnScreen";
import usePermissions from "@/hooks/usePermissions";
import toast from "react-hot-toast";
import LinkTypeBadge from "./LinkTypeBadge";
import { useTranslation } from "next-i18next";
import { useCollections } from "@/hooks/store/collections";
import { useUser } from "@/hooks/store/user";
import { useGetLink, useLinks } from "@/hooks/store/links";
import { useRouter } from "next/router";
import useLocalSettingsStore from "@/store/localSettings";
import LinkPin from "./LinkPin";
import LinkFormats from "./LinkFormats";
import openLink from "@/lib/client/openLink";

type Props = {
  link: LinkIncludingShortenedCollectionAndTags;
  count: number;
  columns: number;
  className?: string;
  editMode?: boolean;
};

export default function LinkCard({ link, columns, editMode }: Props) {
  const { t } = useTranslation();

  const heightMap = {
    1: "h-44",
    2: "h-40",
    3: "h-36",
    4: "h-32",
    5: "h-28",
    6: "h-24",
    7: "h-20",
    8: "h-20",
  };

  const imageHeightClass = useMemo(
    () => (columns ? heightMap[columns as keyof typeof heightMap] : "h-40"),
    [columns]
  );

  const { data: collections = [] } = useCollections();

  const { data: user = {} } = useUser();

  const { setSelectedLinks, selectedLinks } = useLinkStore();

  const {
    settings: { show },
  } = useLocalSettingsStore();

  const {
    data: { data: links = [] },
  } = useLinks();
  const getLink = useGetLink();

  useEffect(() => {
    if (!editMode) {
      setSelectedLinks([]);
    }
  }, [editMode]);

  const handleCheckboxClick = (
    link: LinkIncludingShortenedCollectionAndTags
  ) => {
    if (selectedLinks.includes(link)) {
      setSelectedLinks(selectedLinks.filter((e) => e !== link));
    } else {
      setSelectedLinks([...selectedLinks, link]);
    }
  };

  let shortendURL;

  try {
    if (link.url) {
      shortendURL = new URL(link.url).host.toLowerCase();
    }
  } catch (error) {
    console.log(error);
  }

  const [collection, setCollection] =
    useState<CollectionIncludingMembersAndLinkCount>(
      collections.find(
        (e) => e.id === link.collection.id
      ) as CollectionIncludingMembersAndLinkCount
    );

  useEffect(() => {
    setCollection(
      collections.find(
        (e) => e.id === link.collection.id
      ) as CollectionIncludingMembersAndLinkCount
    );
  }, [collections, links]);

  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useOnScreen(ref);
  const permissions = usePermissions(collection?.id as number);

  const router = useRouter();
  const isPublicRoute = router.pathname.startsWith("/public") ? true : false;

  const [linkModal, setLinkModal] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (
      isVisible &&
      !link.preview?.startsWith("archives") &&
      link.preview !== "unavailable"
    ) {
      interval = setInterval(async () => {
        getLink.mutateAsync({
          id: link.id as number,
          isPublicRoute: isPublicRoute,
        });
      }, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isVisible, link.preview]);

  const selectedStyle = selectedLinks.some(
    (selectedLink) => selectedLink.id === link.id
  )
    ? "border-primary bg-base-300"
    : "border-neutral-content";

  const selectable =
    editMode &&
    (permissions === true || permissions?.canCreate || permissions?.canDelete);

  return (
    <div
      ref={ref}
      className={`link ${selectedStyle} border border-solid border-neutral-content bg-base-200 shadow-md hover:shadow-none duration-100 rounded-2xl relative group`}
      onClick={() =>
        selectable
          ? handleCheckboxClick(link)
          : editMode
            ? toast.error(t("link_selection_error"))
            : undefined
      }
      draggable={true}
      data-link-id={link.id}
    >
      <div
        className="rounded-2xl cursor-pointer h-full flex flex-col justify-between"
        onClick={() =>
          !editMode && openLink(link, user, () => setLinkModal(true))
        }
      >
        {show.image && (
          <div>
            <div
              className={`relative rounded-t-2xl ${imageHeightClass} overflow-hidden`}
            >
              {formatAvailable(link, "preview") ? (
                <Image
                  src={`/api/v1/archives/${link.id}?format=${ArchivedFormat.jpeg}&preview=true&updatedAt=${link.updatedAt}`}
                  width={1280}
                  height={720}
                  alt=""
                  className={`rounded-t-2xl select-none object-cover z-10 ${imageHeightClass} w-full shadow opacity-80 scale-105`}
                  style={show.icon ? { filter: "blur(1px)" } : undefined}
                  draggable="false"
                  onError={(e) => {
                    const target = e.target as HTMLElement;
                    target.style.display = "none";
                  }}
                />
              ) : link.preview === "unavailable" ? (
                <div
                  className={`bg-gray-50 ${imageHeightClass} bg-opacity-80`}
                ></div>
              ) : (
                <div
                  className={`${imageHeightClass} bg-opacity-80 skeleton rounded-none`}
                ></div>
              )}
              {show.icon && (
                <div className="absolute top-0 left-0 right-0 bottom-0 rounded-t-2xl flex items-center justify-center rounded-md">
                  <LinkIcon link={link} />
                </div>
              )}
              {show.preserved_formats &&
                link.type === "url" &&
                atLeastOneFormatAvailable(link) && (
                  <div className="absolute bottom-0 right-0 m-2 bg-base-200 bg-opacity-60 px-1 rounded-md">
                    <LinkFormats link={link} />
                  </div>
                )}
            </div>
            <hr className="divider my-0 border-t border-neutral-content h-[1px]" />
          </div>
        )}

        <div className="flex flex-col justify-between h-full min-h-24">
          <div className="p-3 flex flex-col gap-2">
            {show.name && (
              <p className="truncate w-full text-primary text-sm">
                {unescapeString(link.name)}
              </p>
            )}

            {show.link && <LinkTypeBadge link={link} />}
          </div>

          {(show.collection || show.date) && (
            <div>
              <hr className="divider mt-2 mb-1 last:hidden border-t border-neutral-content h-[1px]" />

              <div className="flex justify-between items-center text-xs text-neutral px-3 pb-1 gap-2">
                {show.collection && !isPublicRoute && (
                  <div className="cursor-pointer truncate">
                    <LinkCollection link={link} collection={collection} />
                  </div>
                )}
                {show.date && <LinkDate link={link} />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay on hover */}
      <div className="absolute pointer-events-none top-0 left-0 right-0 bottom-0 bg-base-100 bg-opacity-0 group-hover:bg-opacity-20 group-focus-within:opacity-20 rounded-2xl duration-100"></div>
      <LinkActions
        link={link}
        collection={collection}
        linkModal={linkModal}
        setLinkModal={(e) => setLinkModal(e)}
      />
      {!isPublicRoute && <LinkPin link={link} />}
    </div>
  );
}
