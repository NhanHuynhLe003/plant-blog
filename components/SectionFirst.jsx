import React from "react";
import Image from "next/image";
import Link from "next/link";
import Author from "./childrenComponents/Author";

// import Swiper styles
import "swiper/css";
import { Swiper, SwiperSlide } from "swiper/react";
import SwiperCore, { Autoplay } from "swiper";

export default function SectionFirst() {
  SwiperCore.use([Autoplay]);
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
  ];
  const bgStyle = {
    background: "url('/images/banner.png') no-repeat",
    backgroundPosition: "right",
  };
  return (
    <section id="firstSection" className="py-16" style={bgStyle}>
      <div className="container mx-auto md: px-20">
        <h1 className="font-bold text-center text-4xl pb-20 capitalize">
          trending
        </h1>
        <Swiper
          slidesPerView={1}
          autoplay={{
            delay: 2000,
            disableOnInteraction: false
          }}
          
          loop={true}
        >
          {dataList.map((data, index) => {
            const {id, desc, genres, img, timePublic, title, avatar, jobAuthor, nameAuthor} = data
            return (
              <SwiperSlide key={data.id}>{Slider(id, img, genres, timePublic, title, desc, nameAuthor, jobAuthor, avatar)}</SwiperSlide>
            );
          })}
        </Swiper>
      </div>
    </section>
  );
}

function Slider(id, imgProp, genres, timePublic, title, desc, nameAuthor, jobAuthor, avatar) {
  return (
    <div className="grid md:grid-cols-2">
      <div className="images">
        <Link href="/">
          <Image src={imgProp.src} alt={imgProp.alt} width={500} height={600} />
        </Link>
      </div>
      <div className="info flex justify-center flex-col">
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
        <div className="content pt-4">
          <Link href="/">
            <h1 className="title text-3xl md:text-6xl font-bold text-gray-800 hover:text-gray-600">
              {title}
            </h1>
          </Link>
          <p className="description text-gray-500 py-4">{desc}</p>
          <Author job={jobAuthor} name={nameAuthor} avatarSrc={avatar}/>
        </div>
      </div>
    </div>
  );
}
