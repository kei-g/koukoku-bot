#include <arpa/inet.h>
#include <iconv.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  iconv_t ic;
  int indent;
} context_t;

static void convert(context_t *ctx, char *source, size_t length);

int main(int argc, const char *argv[]) {
  iconv_t ic = iconv_open("ucs-4", "sjis");
  if (!ic) {
    fprintf(stderr, "iconv_open: %m\n");
    return EXIT_FAILURE;
  }
  context_t ctx = {
    .ic = ic,
    .indent = argc < 2 ? 0 : atoi(argv[1]),
  };
  for (int i = 0x20; i < 0xe0; i++) {
    if (0x7f <= i && i < 0xa1)
      continue;
    char buf[2] = {i};
    convert(&ctx, buf, 1);
  }
  for (int i = 0x81; i < 0xef; i++) {
    if (0x9f < i && i < 0xe0)
      continue;
    for (int j = 0x40; j < 0xfd; j++) {
      if (j == 0x7f)
        continue;
      char buf[3] = {i, j};
      convert(&ctx, buf, 2);
    }
  }
  iconv_close(ic);
  return EXIT_SUCCESS;
}

static void convert(context_t *ctx, char *source, size_t length) {
  unsigned char *src = (unsigned char *)source, dest[16] = {0};
  char *ib = source, *ob = (char *)dest;
  size_t ilen = length, olen = sizeof(dest);
  if (iconv(ctx->ic, &ib, &ilen, &ob, &olen) == 0) {
    printf("%*c\"\\u%02x%02x\": [", ctx->indent, ' ', dest[2], dest[3]);
    if (length < 2)
      printf("%u", src[0]);
    else
      printf("%u,%u", src[0], src[1]);
    puts("],");
  }
}
