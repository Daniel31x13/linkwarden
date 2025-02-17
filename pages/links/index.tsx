import NoLinksFound from "@/components/NoLinksFound";
import { useLinks } from "@/hooks/store/links";
import MainLayout from "@/layouts/MainLayout";
import React, { useRef, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Sort, ViewMode } from "@/types/global";
import { useRouter } from "next/router";
import LinkListOptions from "@/components/LinkListOptions";
import getServerSideProps from "@/lib/client/getServerSideProps";
import { useTranslation } from "next-i18next";
import Links from "@/components/LinkViews/Links";

export default function Index() {
  const { t } = useTranslation();

  const [viewMode, setViewMode] = useState<ViewMode>(
    (localStorage.getItem("viewMode") as ViewMode) || ViewMode.Card
  );
  const [sortBy, setSortBy] = useState<Sort>(
    Number(localStorage.getItem("sortBy")) ?? Sort.DateNewestFirst
  );

  const { links, data } = useLinks({
    sort: sortBy,
  });

  const router = useRouter();

  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (editMode) return setEditMode(false);
  }, [router]);

  useEffect(() => {
    window.addEventListener('dragstart', handleDrag);

    return () => {
      window.removeEventListener('dragstart', handleDrag);
    };
  }, []);

  const isDraggingRef = useRef<boolean>(false)
  const linkIdRef = useRef<number | null>(null)
  const collectionIdRef = useRef<number | null>(null)

  const addEventListeners = () => {
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
  }

  const removeEventListeners = () => {
    window.removeEventListener('dragend', handleDragEnd);
    window.removeEventListener('dragover', handleDragOver)
    window.removeEventListener('dragleave', handleDragLeave)
  }

  const handleDrag = (event: DragEvent) => {
    const linkElement = (event.target as HTMLElement)?.closest('.link') || null;

    if (!linkElement) return

    const linkId = (linkElement as HTMLElement).dataset.linkId

    if (!linkId) return

    linkIdRef.current = parseInt(linkId)
    isDraggingRef.current = true

    addEventListeners()
  }

  const handleDragOver = (event: DragEvent) => {
    if (!isDraggingRef.current) return

    const collectionLinkElement = (event.target as HTMLElement)?.closest('.collection-link') || null;

    if (collectionLinkElement === null) return;

    // get the collection id
    const collectionId = (collectionLinkElement as HTMLElement).dataset.collectionId

    if (collectionId === undefined) return

    if (collectionIdRef.current !== parseInt(collectionId)) {
      collectionIdRef.current = parseInt(collectionId)
    }

    // add drag styles
    if (collectionLinkElement.classList.contains('bg-indigo-600')) return;
    collectionLinkElement?.classList.add('bg-indigo-600')
  }

  const handleDragLeave = (event: DragEvent) => {
    const element = (event.target as HTMLElement)?.closest('.collection-link')

    // remove drag styles
    if (!element) return

    if (!element.classList.contains('bg-indigo-600')) return;
    element.classList.remove('bg-indigo-600')
  }

  const handleDragEnd = async (event: DragEvent) => {
    isDraggingRef.current = false;

    const response = await fetch(`/api/v1/links/${linkIdRef.current}/collection`, {
      method: "PUT",
      body: JSON.stringify({ collectionId: collectionIdRef.current })
    });

    linkIdRef.current = null
    collectionIdRef.current = null
    removeEventListeners();
  }


  return (
    <MainLayout>
      <div className="p-5 flex flex-col gap-5 w-full h-full">
        <LinkListOptions
          t={t}
          viewMode={viewMode}
          setViewMode={setViewMode}
          sortBy={sortBy}
          setSortBy={setSortBy}
          editMode={editMode}
          setEditMode={setEditMode}
        >
          <PageHeader
            icon={"bi-link-45deg"}
            title={t("all_links")}
            description={t("all_links_desc")}
          />
        </LinkListOptions>

        {!data.isLoading && links && !links[0] && (
          <NoLinksFound text={t("you_have_not_added_any_links")}/>
        )}
        <Links
          editMode={editMode}
          links={links}
          layout={viewMode}
          placeholderCount={1}
          useData={data}
        />
      </div>
    </MainLayout>
  );
}

export { getServerSideProps };
