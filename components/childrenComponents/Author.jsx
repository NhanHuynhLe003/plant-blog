import Image from "next/image"
export default function Author({name, job, avatarSrc = "/images/author/author1.jpg"}) {
  return (
    <div className="author flex py-5">
      <Image src={avatarSrc} width={60} height={60} className="rounded-full"/>
      <div className="authorInfo flex flex-col justify-center px-4">
        <h5 className="authorName text-lg font-bold text-gray-800 hover:text-gray-600 capitalize">{name}</h5>
        <h6 className="authorJob text-sm text-gray-500 capitalize">{job}</h6>
      </div>
    </div>
  )
}
