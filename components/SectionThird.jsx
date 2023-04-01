import { Swiper, SwiperSlide } from "swiper/react";
import SwiperCore, { Breakpoints } from "swiper";
import Link from "next/link";
import Image from "next/image";
import Author from "./childrenComponents/Author";
const dataList = [
  {
    id: 1,
    img: { src: "/images/img1.jpg", alt: "img1" },
    title: "First Blog",
    genres: ["business", "travel", "environment"],
    desc: `Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
          quidem. Unde corporis deleniti maxime, illo facere accusantium modi
          eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
          deserunt fugiat vitae.`,
    timePublic: "March 30, 2023",
    nameAuthor: "nhan huynh 1",
    jobAuthor: "FrontEnd Developer",
    avatar: "/images/author/author1.jpg",
  },
  {
    id: 2,
    img: { src: "/images/img2.jpg", alt: "img2" },
    title: "Second Blog",
    genres: ["food", "travel", "study"],
    desc: `Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
          quidem. Unde corporis deleniti maxime, illo facere accusantium modi
          eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
          deserunt fugiat vitae.`,
    timePublic: "March 30, 2023",
    nameAuthor: "nhan huynh 2",
    jobAuthor: "backend Developer",
    avatar: "/images/author/author1.jpg",
  },
  {
    id: 3,
    img: { src: "/images/img3.jpg", alt: "img3" },
    title: "Third Blog",
    genres: ["business", "travel", "environment"],
    desc: `Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
          quidem. Unde corporis deleniti maxime, illo facere accusantium modi
          eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
          deserunt fugiat vitae.`,
    timePublic: "March 30, 2023",
    nameAuthor: "nhan huynh 3",
    jobAuthor: "FullStack Developer",
    avatar: "/images/author/author1.jpg",
  },
  {
    id: 4,
    img: { src: "/images/img4.jpg", alt: "img4" },
    title: "Fourth Blog",
    genres: ["business", "travel", "environment"],
    desc: `Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
            quidem. Unde corporis deleniti maxime, illo facere accusantium modi
            eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
            deserunt fugiat vitae.`,
    timePublic: "March 30, 2023",
    nameAuthor: "nhan huynh 4",
    jobAuthor: "FullStack Developer",
    avatar: "/images/author/author1.jpg",
  },
  {
    id: 5,
    img: { src: "/images/img5.jpg", alt: "img5" },
    title: "Fifth Blog",
    genres: ["business", "travel", "environment"],
    desc: `Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
            quidem. Unde corporis deleniti maxime, illo facere accusantium modi
            eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
            deserunt fugiat vitae.`,
    timePublic: "March 30, 2023",
    nameAuthor: "nhan huynh 5",
    jobAuthor: "FullStack Developer",
    avatar: "/images/author/author1.jpg",
  },
  {
    id: 6,
    img: { src: "/images/img1.jpg", alt: "img6" },
    title: "Sixth Blog",
    genres: ["business", "travel", "environment"],
    desc: `Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
            quidem. Unde corporis deleniti maxime, illo facere accusantium modi
            eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
            deserunt fugiat vitae.`,
    timePublic: "March 30, 2023",
    nameAuthor: "nhan huynh 6",
    jobAuthor: "FullStack Developer",
    avatar: "/images/author/author1.jpg",
  },
];

export default function SectionThird() {
  SwiperCore.use([Breakpoints]);
  return (
    <div className="container mx-auto md:px-20 py-16">
      <h1 className="font-bold text-4xl py-12 text-center capitalize">
        latest post
      </h1>
      <Swiper
        breakpoints={{ 768: { slidesPerView: 2 }, 330: { slidesPerView: 1 } }}
        //330 => 768: man hinh nho
        slidesPerView={2}
      >
        {dataList &&
          dataList.map((data, index) => {
            const {
              id,
              desc,
              genres,
              img,
              timePublic,
              title,
              avatar,
              jobAuthor,
              nameAuthor,
            } = data;
            return (
              <SwiperSlide>
                {Post(
                  id,
                  img,
                  genres,
                  timePublic,
                  title,
                  desc,
                  nameAuthor,
                  jobAuthor,
                  avatar
                )}
              </SwiperSlide>
            );
          })}
      </Swiper>
    </div>
  );
}

function Post(
  id,
  imgProp,
  genres,
  timePublic,
  title,
  desc,
  nameAuthor,
  jobAuthor,
  avatar
) {
  return (
    <div className="item">
      <div className="images">
        <Link href="/">
          <Image src={imgProp.src} alt={imgProp.alt} width={600} height={400} />
        </Link>
      </div>
      <div className="info flex justify-center flex-col py-3">
        <div className="category flex gap-2">
          <Link
            href="/"
            className="genres flex gap-1 capitalize text-orange-600 hover:text-orange-700"
          >
            {genres.map((genre, index) => {
              return (
                <span>
                  {genre} {index !== genres.length - 1 ? "," : ""}{" "}
                </span>
              );
            })}
          </Link>
          <span>-</span>
          <Link
            href="/"
            className="timePublish capitalize text-gray-800 hover:text-gray-600"
          >
            {timePublic}
          </Link>
        </div>
        <div className="content pt-2">
          <Link href="/">
            <h1 className="title text-3xl md:text-4xl font-bold text-gray-800 hover:text-gray-600">
              {title}
            </h1>
          </Link>
          <p className="description text-gray-500 py-2">{desc}</p>
          <Author job={jobAuthor} name={nameAuthor} avatarSrc={avatar} />
        </div>
      </div>
    </div>
  );
}
