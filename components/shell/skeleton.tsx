/** Static first paint (desktop sidebar + content blocks) while the browser-only app loads. */
export function ShellSkeleton() {
  return (
    <div aria-busy className="min-h-dvh">
      <div className="fixed inset-y-0 left-0 hidden w-[68px] border-r border-line bg-sidebar md:block lg:w-[248px]" />
      <div className="md:pl-[68px] lg:pl-[248px]">
        <div className="h-14 border-b border-line" />
        <div className="mx-auto max-w-[1440px] space-y-5 px-4 pt-6 sm:px-6 lg:px-8">
          <div className="h-7 w-56 animate-pulse rounded-md bg-surface-3" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[118px] animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </div>
          <div className="h-[320px] animate-pulse rounded-xl border border-line bg-surface" />
        </div>
      </div>
    </div>
  );
}
