import Image from "next/image"
export default function Author() {
  return (
    <div className="author flex py-5">
      <Image src="/images/author/author1.jpg" width={60} height={60} className="rounded-full"/>
      <div className="authorInfo flex flex-col justify-center px-4">
        <h5 className="authorName text-lg font-bold text-gray-800 hover:text-gray-600 capitalize">nhan huynh</h5>
        <h6 className="authorJob text-sm text-gray-500 capitalize">fullstack developer</h6>
      </div>
    </div>
  )
}
