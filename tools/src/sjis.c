#include <iconv.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct _template_s template_t;

typedef struct {
  iconv_t ic;
  int indent;
  template_t *templates;
} context_t;

struct _template_s {
  int begin;
  int end;
  void (*func)(context_t *, int, ...);
};

static void convert(context_t *ctx, int i, ...);
static void convert2(context_t *ctx, int i, ...);

int main(int argc, const char *argv[]) {
  iconv_t ic = iconv_open("ucs-4", "sjis");
  if (!ic) {
    fprintf(stderr, "iconv_open: %m\n");
    return EXIT_FAILURE;
  }
  template_t t[] = {
    {.begin = 0x20, .end = 0x7f, .func = convert},
    {.begin = 0xa1, .end = 0xe0, .func = convert},
    {.begin = 0x81, .end = 0xa0, .func = convert2},
    {.begin = 0xe0, .end = 0xef, .func = convert2},
    {.begin = 0x40, .end = 0x7f, .func = convert},
    {.begin = 0x80, .end = 0xfd, .func = convert},
  };
  context_t ctx = {
    .ic = ic,
    .indent = argc < 2 ? 0 : atoi(argv[1]),
    .templates = t,
  };
  for (size_t i = 0; i < 4; i++) {
    template_t *p = &t[i];
    for (int j = p->begin; j < p->end; j++)
      (*p->func)(&ctx, j, -1);
  }
  iconv_close(ic);
  return EXIT_SUCCESS;
}

static void convert(context_t *ctx, const int i, ...) {
  unsigned char src[4] = {i}, dest[16] = {0};
  size_t length = 1;
  va_list ap;
  va_start(ap, i);
  for (;;) {
    int value = va_arg(ap, int);
    if (value < 0)
      break;
    src[length++] = (unsigned char)value;
  }
  va_end(ap);
  char *ib = (char *)src, *ob = (char *)dest;
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

static void convert2(context_t *ctx, int i, ...) {
  for (int j = 4; j < 6; j++) {
    template_t *t = &ctx->templates[j];
    for (int k = t->begin; k < t->end; k++)
      (*t->func)(ctx, i, k, -1);
  }
}
