# Developer design notes

This file documents some of the design decisions made during the development of THT. This document will be irrelevant for most people.

## polygon-clipping over ClipperLib?

The [_polygon-clipping_](https://www.npmjs.com/package/polygon-clipping) npm library has been used instead of the ClipperLib library that is embedded into Foundry because I was running into issues with random line segments appearing when merging some polygons - possibly due to rounding or precision errors? I did also try using the OffsetClipper to increase the size of the polygons, merging them, then doing an inverse of the OffsetClipper; however this just resulted in polygons becoming warped as they were merged with others, even on what should've been simply geometry - and it got worse the more polygons were being merged and got worse for each paint operation.

I switched over to polygon-clipping and have not observed any issues with it creating these same random line incursions.
