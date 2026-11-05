// Loads the built plugin the way Sonnet's Loader does and checks a few words.
// Usage: plugintest <path/to/sonnet_harper.so>
// SPDX-License-Identifier: Apache-2.0
#include "client_p.h"
#include "spellerplugin_p.h"

#include <QCoreApplication>
#include <QElapsedTimer>
#include <QPluginLoader>
#include <QThread>
#include <cstdio>

static int failures = 0;
static void expect(bool ok, const char *what)
{
    std::printf("%s %s\n", ok ? "OK  " : "FAIL", what);
    if (!ok) {
        ++failures;
    }
}

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    // The test adds a personal word; never let it reach the real
    // ~/.config/harper-ls dictionary.
    if (qEnvironmentVariableIsEmpty("HARPER_SONNET_USER_DICT") || argc < 2) {
        std::printf("usage: HARPER_SONNET_USER_DICT=<tmp>/dictionary.txt plugintest <sonnet_harper.so>\n");
        return 2;
    }
    QPluginLoader loader(QString::fromLocal8Bit(argv[1]));
    auto *client = qobject_cast<Sonnet::Client *>(loader.instance());
    expect(client != nullptr, "plugin loads as org.kde.sonnet.Client");
    if (!client) {
        std::printf("%s\n", qPrintable(loader.errorString()));
        return 1;
    }
    expect(client->name() == QLatin1String("Harper"), "name is Harper");
    expect(client->languages().contains(QStringLiteral("sk_SK")), "offers sk_SK");

    Sonnet::SpellerPlugin *sk = client->createSpeller(QStringLiteral("sk_SK"));
    expect(sk != nullptr, "creates sk_SK speller");
    expect(client->createSpeller(QStringLiteral("xx_XX")) == nullptr, "rejects xx_XX");

    // The first word blocks until the dictionary is loaded.
    QElapsedTimer t;
    t.start();
    const bool firstCorrect = sk->isCorrect(QStringLiteral("nezavisle"));
    std::printf("first word answered after %lld ms (includes loading)\n", t.elapsed());
    expect(!firstCorrect, "first word already checked by the loaded dictionary");

    expect(!sk->isCorrect(QStringLiteral("nezavisle")), "nezavisle misspelled");
    expect(sk->isCorrect(QStringLiteral("nezávisle")), "nezávisle correct");
    const QStringList s = sk->suggest(QStringLiteral("nezavisle"));
    std::printf("suggest(nezavisle) = %s\n", qPrintable(s.join(QStringLiteral(", "))));
    expect(s.contains(QStringLiteral("nezávisle")), "suggests nezávisle");

    t.restart();
    int n = 0;
    for (const char *w : {"Dobrý", "deň", "toto", "je", "slovenský", "text", "s", "chybou", "vetaa", "a", "ďalšie", "slová"}) {
        sk->isCorrect(QString::fromUtf8(w));
        ++n;
    }
    std::printf("%d words in %lld ms (first pass)\n", n, t.elapsed());

    expect(sk->addToSession(QStringLiteral("Qwzxyk")), "addToSession");
    expect(sk->isCorrect(QStringLiteral("Qwzxyk")), "session word accepted");

    expect(sk->addToPersonal(QStringLiteral("Klocokovci")), "addToPersonal");
    expect(sk->isCorrect(QStringLiteral("Klocokovci")), "personal word accepted");

    delete sk;
    std::printf("%s\n", failures ? "FAILED" : "ALL OK");
    return failures ? 1 : 0;
}
