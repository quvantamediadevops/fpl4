export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading players">
      <div className="bg-gradient-to-b from-mist to-white">
        <div className="container-page animate-pulse pt-7 pb-5 sm:pt-12 sm:pb-8">
          <div className="h-3 w-56 rounded bg-line" />
          <div className="mt-4 h-8 w-64 rounded-lg bg-line sm:h-12 sm:w-[28rem]" />
          <div className="mt-3 h-4 w-full max-w-md rounded bg-line/70" />
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[62px] rounded-2xl border border-line bg-white sm:h-[70px]" />
            ))}
          </div>
        </div>
      </div>
      <div className="container-page animate-pulse pt-2 sm:pt-3">
        <div className="h-12 rounded-xl border border-line bg-white sm:h-[52px]" />
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-11 rounded-xl bg-mist sm:w-32 sm:rounded-full" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-4 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-mist ring-1 ring-line">
              <div className="absolute bottom-3 left-3 h-4 w-16 rounded-full bg-line" />
              <div className="absolute right-6 bottom-9 left-3 h-4 rounded bg-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
