chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "summarizePage") {
        summarizePageContent();
    }
});
// utils.js content

const stopwords_en = ['the', 'is', 'in', 'and', 'to', 'a', 'of']; // Add more stopwords for English

const encodings = {
    bag_of_word: (sent) => remove_stopwords(Array.from(new Set(sent.split(' ')))),
    as_they_are: (sent) => remove_stopwords(sent.split(' ').map(el => el.trim().toLowerCase())),
};

const distances = {
    jaccard: (s1, s2) => intersection(s1, s2).length / union(s1, s2).length,
    overlap: (s1, s2) => intersection(s1, s2).length / Math.min(s1.length, s2.length),
};

const intersection = (set1, set2) => set1.filter(el => set2.includes(el));
const union = (set1, set2) => [...new Set([...set1, ...set2])];

const get_tf_idf = (sentences, content) => {
    const dictionary = {};
    sentences.forEach(sentence => sentence.split(' ').forEach(word => dictionary[word] = (dictionary[word] || 0) + 1));

    const idfs = Object.fromEntries(
        Object.entries(dictionary).map(([word, count]) => {
            const sentence_count = sentences.filter(sentence => sentence.includes(word)).length;
            return [word, Math.log2(sentences.length / sentence_count)];
        })
    );

    return Object.fromEntries(
        Object.entries(idfs).map(([word, idf]) => [
            word,
            sentences.map(sentence => sentence.split(' ').filter(token => token === word).length * idf)
        ])
    );
};

const get_saliency = (sentence, tf_idf) => {
    const tokenized = sentence.split(' ');
    return tokenized.reduce((sum, token) => sum + (tf_idf[token]?.reduce((a, b) => a + b, 0) || 0), 0) / tokenized.length;
};

const remove_stopwords = (set) => set.filter(word => !stopwords_en.includes(word));

// textrank.js content

class TextRank {
    constructor({
        encoding = 'as_they_are',
        distance = 'jaccard',
        alfa = 0.85,
        pr_iteration = 20
    }) {
        this.alfa = alfa;
        this.pr_iteration = pr_iteration;
        this.encoding = encodings[encoding];
        this.distance = distances[distance];
        this.graph = null;
        this.sentences = null;
        this.content = null;
    }

    loadFromText(content) {
        const sentences = content.match(/[^\.!\?]+[\.!\?]+/g);

        if (sentences == null) {
            throw new Error("No sentences found in the content.");
        }

        this.sentences = sentences;
        this.content = content;

        this.graph = [];
        for (let i = 0; i < this.sentences.length; i++) {
            this.graph[i] = [];
            for (let j = 0; j < this.sentences.length; j++) {
                this.graph[i][j] = (i != j) ? this.distance(
                    this.encoding(this.sentences[i]),
                    this.encoding(this.sentences[j])
                ) : 0;
            }
        }

        this.graph = this.normalize_graph(this.graph);
        this.tf_idf = get_tf_idf(this.sentences, this.content);
        this.sentences = this.sentences.map(el => ({
            sentence: el,
            saliency: get_saliency(el, this.tf_idf)
        }));
    }

    summarize(choose_k = () => 5) {
        const ranked = this.apply_page_rank();
        const enriched = ranked.map((el, idx) => ({ el, idx }));
        enriched.sort((a, b) => b.el - a.el);
        const indexes = enriched.splice(0, choose_k(this.sentences)).map(el => el.idx);

        indexes.sort();
        const summary = indexes.map(idx => this.sentences[idx].sentence);

        return summary.join(' ');
    }

    apply_page_rank() {
        let r = this.sentences.map(s => s.saliency);

        const get_incoming_nodes_sum = (prev_vec, idx) => {
            let s = 0;
            for (let i = 0; i < prev_vec.length; i++) {
                if (i != idx) {
                    s += (prev_vec[i] * this.graph[idx][i]) / (prev_vec.length - 1);
                }
            }
            return s;
        };

        for (let i = 0; i < this.pr_iteration; i++) {
            r = r.map((_, idx) => (
                (this.alfa * get_incoming_nodes_sum(r, idx)) + ((1 - this.alfa) * (1 / this.sentences.length))
            ));
        }

        return r;
    }

    normalize_graph(graph) {
        return graph.map(row => {
            const sum = row.reduce((acc, val) => acc + val, 0);
            return sum ? row.map(weight => weight / sum) : row;
        });
    }
}

// content.js main functionality

console.log("content.js loaded successfully");

function summarizePageContent() {
    let bodyText = extractContent();

    if (!bodyText || bodyText.trim().length === 0) {
        console.error("Unable to extract content. No text found on the page.");
        notifyBackground("Unable to extract content");
        return;
    }

    let sentences = bodyText.match(/[^.!?]+[.!?]+/g) || [];

    if (sentences.length === 0) {
        console.log("No sentences found.");
        notifyBackground("No sentences found");
        return;
    }

    let textRank = new TextRank({
        encoding: 'as_they_are',
        distance: 'jaccard',
        alfa: 0.85,
        pr_iteration: 100
    });

    textRank.loadFromText(bodyText);
    let summary = textRank.summarize(() => Math.min(5, sentences.length));

    chrome.runtime.sendMessage({summary});
}

function extractContent() {
    let textContent = "";
    const relevantTags = ['p', 'h1', 'h2', 'article'];

    // Extract text only from relevant tags
    relevantTags.forEach(tag => {
        document.querySelectorAll(tag).forEach(element => {
            textContent += " " + element.innerText;
        });
    });

    return textContent;
}

summarizePageContent();