/** Fast route feedback for dynamic authenticated pages. The existing page data still owns success and error states. */
export default function Loading() {
  return <div className="route-skeleton" role="status" aria-label="Opening page">
    <span /><span /><span />
  </div>;
}
